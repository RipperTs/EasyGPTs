import json
from langchain_community.utilities import SQLDatabase
from sqlalchemy import create_engine
from typing import Optional, List, Union, Dict, Any

from pydantic import BaseModel


class IgnoreFieldsPo(BaseModel):
    table_name: str
    """表名"""
    field_names: List[str]
    """字段名"""


class JoinedPo(BaseModel):
    """
    关联字段配置
    """
    column_name_a: str
    """表A的字段名"""
    column_name_b: str
    """表B的字段名"""


class DBSchemaService:
    """
    数据库DDL转换服务
    """

    def __init__(self, url: str,
                 ignore_fields: Optional[List[IgnoreFieldsPo]] = None,
                 view_support: bool = False):
        """
        初始化数据库schema服务
        :param url: 数据库连接url
        """
        self.engine = create_engine(url)
        # 修复：避免使用可变默认参数 []
        self.ignore_fields = ignore_fields if ignore_fields is not None else []
        self.view_support = view_support

    def get_schema(self, tables: List[str] = None):
        # 获取表的schema, 支持获取视图 view_support=True
        # 注意：SQLDatabase 的 sample_rows_in_table_info 控制是否读取样本数据，0表示只读结构
        db = SQLDatabase(self.engine, sample_rows_in_table_info=0, view_support=self.view_support)
        return db.get_table_info(tables)

    def normalize_identifier(self, identifier: str) -> str:
        """
        标准化表名/字段名，兼容 schema.table、"SCHEMA"."TABLE"、`table` 等格式
        """
        if not identifier:
            return ""

        clean_identifier = identifier.strip().strip(",").strip("`\"'")
        if "." in clean_identifier:
            clean_identifier = clean_identifier.split(".")[-1]

        return clean_identifier.strip("`\"'")

    def convert_table_schema(self, table_schema):
        # 分割每个表的schema为行
        lines = table_schema.strip().split('\n')
        # 初始化新的schema
        new_schema = []
        table_comment = ""
        ignore_fields = []
        # 遍历每一行
        for line in lines:
            # 去掉前后的空格
            line = line.strip()
            # 跳过注释和表定义的行
            if line.startswith('CREATE TABLE'):
                # 简单的解析获取表名，假设格式标准
                parts = line.split()
                if len(parts) > 2:
                    table_name_raw = parts[2]
                    table_name = self.normalize_identifier(table_name_raw)
                    ignore_fields = self.get_ignore_fields(table_name)
                continue

            if line.startswith(')DEFAULT CHARSET') or line.startswith(') ENGINE'):
                # 尝试在结束行捕获表注释
                if "COMMENT" in line:
                    try:
                        comment = self.normalize_comment(line.split('COMMENT')[1])
                        table_comment = f"COMMENT '{comment}'"
                    except IndexError:
                        pass
                continue

            column_name, column_type = self.get_column(line)

            # 如果解析不到列名（例如仅仅是括号或空行），跳过
            if not column_name:
                continue

            if self.should_ignore_column(column_name, ignore_fields):
                continue

            if "AUTO_INCREMENT" in line:
                # 处理主键定义
                new_schema.append(f'    {column_name} INTEGER PRIMARY KEY, -- Unique ID')
            elif "ENGINE" in line and "COMMENT" in line:
                # 处理旧版本或特定方言可能的行内注释
                try:
                    comment = self.normalize_comment(line.split('COMMENT')[1])
                    table_comment = f"COMMENT '{comment}'"
                except IndexError:
                    pass
            elif 'COMMENT' in line:
                # 处理带注释的表字段
                try:
                    comment = self.normalize_comment(line.split('COMMENT')[1])
                    new_schema.append(f'    {column_name} {column_type}, -- {comment}')
                except IndexError:
                    new_schema.append(f'    {column_name} {column_type}')
            else:
                # 去掉AUTO_INCREMENT和DEFAULT等多余部分
                line_clean = line.split(' AUTO_INCREMENT')[0]
                line_clean = line_clean.split(' DEFAULT')[0]

                if not self.is_table_option_or_constraint(line_clean):
                    column_name, column_type = self.get_column(line_clean)
                    if column_name:
                        new_schema.append(f'    {column_name} {column_type}')

        # 重新组装 CREATE TABLE 语句
        try:
            table_name = self.normalize_identifier(table_schema.split()[2])
        except IndexError:
            table_name = "UNKNOWN_TABLE"

        new_schema = self.normalize_column_commas(new_schema)
        new_schema = ['CREATE TABLE ' + table_name + ' ('] + new_schema + [f') {table_comment};']

        # 合并为一个字符串
        return '\n'.join(new_schema)

    def normalize_comment(self, comment: str) -> str:
        """
        清理字段/表注释两侧的 SQL 包裹字符
        """
        return comment.strip().strip("= ").strip(",").strip(";").strip("'").strip('"')

    def normalize_column_commas(self, schema_lines: List[str]) -> List[str]:
        """
        统一字段分隔符，避免表级选项被跳过后生成缺少逗号的 schema
        """
        normalized_lines = []
        last_index = len(schema_lines) - 1

        for index, line in enumerate(schema_lines):
            if " -- " in line:
                column_part, comment = line.split(" -- ", 1)
                column_part = column_part.rstrip(",").rstrip()
                line = f'{column_part} -- {comment}'
                if index < last_index:
                    line = f'{column_part}, -- {comment}'
            else:
                line = line.rstrip(",").rstrip()
                if index < last_index:
                    line = f'{line},'

            normalized_lines.append(line)

        return normalized_lines

    def should_ignore_column(self, column_name: str, ignore_fields: List[str]) -> bool:
        """
        按字段名精确匹配忽略项，避免 ID 误匹配 VALID_FROM 这类字段
        """
        normalized_column_name = self.normalize_identifier(column_name).lower()

        return any(
            normalized_column_name == self.normalize_identifier(ignore_field).lower()
            for ignore_field in ignore_fields
        )

    def is_table_option_or_constraint(self, line: str) -> bool:
        """
        跳过约束、索引和 Oracle/MySQL/PostgreSQL 的表级附加语句
        """
        upper_line = line.strip().upper()
        skip_keywords = [
            ')',
            'PRIMARY KEY',
            'KEY',
            'CONSTRAINT',
            'UNIQUE',
            'INDEX',
            'FOREIGN KEY',
            'CHECK',
            'PARTITION',
            'TABLESPACE',
            'LOB',
            'SEGMENT',
            'PCTFREE',
            'INITRANS',
            'STORAGE'
        ]

        if upper_line == 'ENGINE' or upper_line.startswith('ENGINE '):
            return True

        return any(
            upper_line == keyword
            or upper_line.startswith(f'{keyword} ')
            or upper_line.startswith(f'{keyword}(')
            for keyword in skip_keywords
        )

    def get_ignore_fields(self, table_name) -> List[str]:
        """
        获取忽略的字段
        :param table_name:
        :return:
        """
        normalized_table_name = self.normalize_identifier(table_name).lower()

        for ignore_item in self.ignore_fields:
            ignore_table_name = self.normalize_identifier(ignore_item.table_name).lower()
            if ignore_table_name == normalized_table_name:
                return ignore_item.field_names
        return []

    def get_column(self, line):
        """
        解析每一行的字段信息
        :param line:
        :return:
        """
        parts = line.split()
        if len(parts) > 1:
            column_name = self.normalize_identifier(parts[0])
            column_type = parts[1]
            column_type = column_type.split('(')[0]
            # 排除一些非字段定义的关键字开头
            if self.is_table_option_or_constraint(column_name):
                return None, None
            return column_name, column_type
        return None, None

    def convert_schema(self, original_schema):
        """
        开始转换schema
        :param original_schema: 原始schema
        :return:
        """
        if not original_schema:
            return ""

        table_schemas = original_schema.strip().split('\n\n')
        # 初始化结果列表
        new_schemas = []

        # 遍历每个表的schema
        for table_schema in table_schemas:
            if table_schema.strip():
                new_schemas.append(self.convert_table_schema(table_schema))

        # 合并所有表的schema为一个字符串
        return '\n\n'.join(new_schemas)


def _parse_pydantic_list(data: Union[str, List[Dict], List[BaseModel], None], model_class) -> List[Any]:
    """
    辅助函数：将JSON字符串、字典列表或对象列表统一转换为Pydantic对象列表
    """
    if not data:
        return []

    # 1. 如果是 JSON 字符串，先反序列化
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError as e:
            print(f"Warning: Failed to parse JSON config for {model_class.__name__}: {e}")
            return []

    # 2. 转换列表内容
    result_list = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                try:
                    result_list.append(model_class(**item))
                except Exception as e:
                    print(f"Warning: Validation error for {model_class.__name__}: {e}")
                    return []
            elif isinstance(item, model_class):
                result_list.append(item)

    return result_list


def main(database_url: str,
         include_tables_list: str,
         ignore_fields: Union[str, List[Dict], List[IgnoreFieldsPo], None] = None,
         joined_config: Union[str, List[Dict], List[JoinedPo], None] = None,
         view_support: bool = False):
    """
    生成模型需要用的schema
    :param database_url: 数据源连接地址
    :param include_tables_list: 包含的表列表 (支持List或逗号分隔的字符串 "users,orders")
    :param ignore_fields: 忽略字段配置 (支持JSON字符串、字典列表或对象列表)
    :param joined_config: 关联字段配置 (支持JSON字符串、字典列表或对象列表)
    :param view_support: 是否支持视图
    :return: raw_schema, prompt_schema, joineds
    """

    # 1. 处理 include_tables_list (支持字符串分割)
    final_tables_list = [t.strip() for t in include_tables_list.split(',') if t.strip()]

    # 2. 处理 ignore_fields (转换 JSON/Dict -> Pydantic Model)
    final_ignore_fields = _parse_pydantic_list(ignore_fields, IgnoreFieldsPo)

    # 3. 处理 joined_config (转换 JSON/Dict -> Pydantic Model)
    final_joined_config = _parse_pydantic_list(joined_config, JoinedPo)

    # 初始化服务
    db_schema_service = DBSchemaService(database_url, final_ignore_fields, view_support)

    # 获取数据表结构
    raw_schema = db_schema_service.get_schema(final_tables_list)

    # 转换为模型需要的schema格式
    prompt_schema = db_schema_service.convert_schema(raw_schema)

    # 转换关联字段
    joineds = ""
    for joined in final_joined_config:
        joineds += f"-- {joined.column_name_a} can be joined with {joined.column_name_b}\n"

    return {
        "raw_schema": raw_schema, "prompt_schema": prompt_schema, "joineds": joineds
    }

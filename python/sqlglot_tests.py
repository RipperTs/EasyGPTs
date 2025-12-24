import sqlglot


def main(sql, write="mysql", read=None):
    """
    转换SQL语法
    :param sql:
    :param write:
    :param read:
    :return: 解析错误将返回原始SQL和错误信息
    """
    try:
        if read.strip() == 'auto':
            read = None

        if write.strip() == 'auto':
            write = None

        new_sql = sqlglot.transpile(sql, write=write, read=read)
        return {
            "sql": new_sql[0],
            "error": ""
        }
    except Exception as e:
        return {
            "sql": sql,
            "error": str(e)
        }


if __name__ == '__main__':
    sql = "SELECT * FROM users WHERE created_at >= NOW() - INTERVAL '7 days';"
    result = main(sql, read="postgres")
    print(result)

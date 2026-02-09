import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { EditorVariableLabelPickerType } from '../../type';
import { useCallback, useEffect } from 'react';
import { $createVariableLabelNode, VariableLabelNode } from './node';
import { TextNode } from 'lexical';
import { getHashtagRegexString } from './utils';
import { mergeRegister } from '@lexical/utils';
import { registerLexicalTextEntity } from '../../utils';
import { useTranslation } from 'next-i18next';

const REGEX = new RegExp(getHashtagRegexString(), 'i');

export default function VariableLabelPlugin({
  variables
}: {
  variables: EditorVariableLabelPickerType[];
}) {
  const { t } = useTranslation();
  type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
  const tKey = useCallback((key: string) => (t as unknown as TranslateFn)(key), [t]);
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (!editor.hasNodes([VariableLabelNode]))
      throw new Error('VariableLabelPlugin: VariableLabelPlugin not registered on editor');
  }, [editor]);

  const createVariableLabelPlugin = useCallback(
    (textNode: TextNode): VariableLabelNode => {
      const variablePath = textNode.getTextContent().slice(3, -3);
      const splitIndex = variablePath.indexOf('.');
      const parentKey = splitIndex >= 0 ? variablePath.slice(0, splitIndex) : variablePath;
      const childrenKey = splitIndex >= 0 ? variablePath.slice(splitIndex + 1) : '';
      const currentVariable = variables.find(
        (item) => (item.parent.insertId || item.parent.id) === parentKey && item.key === childrenKey
      );
      const parentLabel = currentVariable?.parent?.label
        ? tKey(currentVariable.parent.label)
        : parentKey;
      const childLabel = currentVariable?.label ? tKey(currentVariable.label) : childrenKey;
      const variableLabel = `${parentLabel}.${childLabel}`;
      const nodeAvatar = currentVariable?.parent?.avatar || '';
      return $createVariableLabelNode(textNode.getTextContent(), variableLabel, nodeAvatar);
    },
    [tKey, variables]
  );

  const getVariableMatch = useCallback((text: string) => {
    const matches = REGEX.exec(text);
    if (!matches) return null;
    // if (variableKeys.indexOf(matches[4]) === -1) return null;
    const hashtagLength = matches[4].length + 6;
    const startOffset = matches.index;
    const endOffset = startOffset + hashtagLength;
    return {
      end: endOffset,
      start: startOffset
    };
  }, []);

  useEffect(() => {
    mergeRegister(
      ...registerLexicalTextEntity(
        editor,
        getVariableMatch,
        VariableLabelNode,
        createVariableLabelPlugin
      )
    );
  }, [createVariableLabelPlugin, editor, getVariableMatch]);

  return null;
}

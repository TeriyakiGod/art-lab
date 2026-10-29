import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";

const extensions = [javascript(), EditorView.lineWrapping];

export function Editor({ value, onChange }: { value: string; onChange(v: string): void }) {
  return (
    <CodeMirror
      className="editor"
      value={value}
      height="100%"
      theme={oneDark}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{ foldGutter: false, highlightActiveLineGutter: true }}
    />
  );
}

import {EditorView, basicSetup} from "codemirror"
import {keymap} from "@codemirror/view"
import {indentWithTab} from "@codemirror/commands"
import {StreamLanguage} from "@codemirror/language"
import {yaml} from "@codemirror/legacy-modes/mode/yaml"

let editor = new EditorView({
  extensions: [basicSetup, keymap.of([indentWithTab]), StreamLanguage.define(yaml)],
  parent: document.body
})

window.editor = editor;


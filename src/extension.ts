import * as vscode from 'vscode';
import * as tree_sitter from 'web-tree-sitter';
import * as path from 'path';
import * as coloring from './coloring';
import * as formatting from './formatting';

let initTreeSitter = tree_sitter.init();


export function activate(context: vscode.ExtensionContext) {
    let trees: { [uri: string]: tree_sitter.Tree } = {};
    let smlLang: {
        module: string;
        color: (root: tree_sitter.SyntaxNode) => vscode.SemanticTokens;
        parser?: tree_sitter;
    } = { module: 'tree-sitter-sml', color: coloring.betterColorSML, parser: undefined };

    async function open(editor: vscode.TextEditor) {
        if (editor.document.languageId !== 'sml') {
            return;
        }

        if (!smlLang.parser) {
            let wasm = path.relative(process.cwd(), path.join(context.extensionPath, "parsers", "sml.wasm"));
            let lang = await tree_sitter.Language.load(wasm);
            let parser = new tree_sitter();
            parser.setLanguage(lang);
            smlLang.parser = parser;
        }

        let tree = smlLang.parser.parse(editor.document.getText());
        trees[editor.document.uri.toString()] = tree;
    }

    function edit(edit: vscode.TextDocumentChangeEvent) {
        if (edit.document.languageId !== 'sml' || !smlLang.parser) {
            return;
        }

        if (edit.contentChanges.length !== 0) {
            let old_tree = trees[edit.document.uri.toString()];
            for (let change of edit.contentChanges) {
                let startIndex = change.rangeOffset;
                let oldEndIndex = change.rangeOffset + change.rangeLength;
                let newEndIndex = change.rangeOffset + change.text.length;
                let startPos = edit.document.positionAt(startIndex);
                let oldEndPos = edit.document.positionAt(oldEndIndex);
                let newEndPos = edit.document.positionAt(newEndIndex);
                let startPosition = asPoint(startPos);
                let oldEndPosition = asPoint(oldEndPos);
                let newEndPosition = asPoint(newEndPos);
                let delta = { startIndex, oldEndIndex, newEndIndex, startPosition, oldEndPosition, newEndPosition };
                old_tree.edit(delta);
            }
            let new_tree = smlLang.parser.parse(edit.document.getText(), old_tree);
            trees[edit.document.uri.toString()] = new_tree;
        }
    }

    function close(doc: vscode.TextDocument) {
        delete trees[doc.uri.toString()];
    }


    async function colorAllOpen() {
        for (let editor of vscode.window.visibleTextEditors) {
            await open(editor);
        }
    }

    async function onChangeConfiguration(event: vscode.ConfigurationChangeEvent) {
        let colorizationNeedsReload = event.affectsConfiguration('workbench.colorTheme');
        if (colorizationNeedsReload) {
            colorAllOpen();
        }
    }

    function asPoint(pos: vscode.Position): tree_sitter.Point {
        return { row: pos.line, column: pos.character };
    }

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(onChangeConfiguration));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(edit));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(close));
    context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(colorAllOpen));
    context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider({ language: 'sml' }, new SemanticTokensProvider(trees), coloring.legend()))
    let diagonosticCollection = vscode.languages.createDiagnosticCollection('sml');
    context.subscriptions.push(diagonosticCollection);

    vscode.languages.registerDocumentFormattingEditProvider({ language: 'sml', scheme: 'file' }, {
        provideDocumentFormattingEdits(doc, opt, _tok) {
            let root = trees[doc.uri.toString()].rootNode;
            if (root.hasError()) {
                return [];
            } else {
                return formatting.format(root, opt);
            }
        }
    });

    vscode.languages.registerHoverProvider({ language: 'sml', scheme: 'file' }, {
        provideHover(doc, pos, _tok) {
            let ran = doc.getWordRangeAtPosition(pos, /'[A-Za-z0-9_']+|[A-Za-z][A-Za-z0-9_']*|[!%&$#+\-/:<=>?@\\~`^|*]+|~?[0-9]+\.[0-9]+([Ee]~?[0-9]+)?|~?[0-9]+|~?0x[0-9A-Fa-f]+|0w[0-9]+|0wx[0-9A-Fa-f]+/);
            if (ran) {
                return new vscode.Hover(doc.getText(ran));
            }
        }
    });

    async function activateLazily() {
        await initTreeSitter;
        colorAllOpen();
    }
    activateLazily();
}

export function deactivate() { }



export class SemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    constructor(private trees: { [uri: string]: tree_sitter.Tree }) {
        console.log(trees)

    }


    public async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
        return new Promise<vscode.SemanticTokens>((resolve, reject) => {
            token.onCancellationRequested(reject);
            resolve(coloring.betterColorSML(this.trees[document.uri.toString()].rootNode));
        })

    }
}
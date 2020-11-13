import * as tree_sitter from 'web-tree-sitter';
import * as vscode from 'vscode';

// function isVisible(node: tree_sitter.SyntaxNode, visibleRanges: { start: number, end: number }[]) {
//     for (let { start, end } of visibleRanges) {
//         let overlap = node.startPosition.row <= end + 1 && start - 1 <= node.endPosition.row;
//         if (overlap) {
//             return true;
//         }
//     }
//     return false;
// }


export function legend() {
    const tokenTypes = ["namespace",
        "type",
        "struct",
        "class",
        "interface",
        "enum",
        "keyword",
        "function",
        "member",
        "macro",
        "variable",
        "parameter",
        "property",
        "enumMember",
        "event"];
    const tokenModifiers = ['declaration'];
    return new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);
}


function range(root: tree_sitter.SyntaxNode): vscode.Range {
    return new vscode.Range(root.startPosition.row, root.startPosition.column, root.endPosition.row, root.endPosition.column);
}
export function betterColorSML(root: tree_sitter.SyntaxNode): vscode.SemanticTokens {
    const builder = new vscode.SemanticTokensBuilder(legend());
    function isUpper(id: string) {
        return id.charAt(0) >= 'A' && id.charAt(0) <= 'Z';
    }
    function visit(node: tree_sitter.SyntaxNode) {
        function mkToken(scope: string, mods: string[] = []) {
            builder.push(range(node), scope, mods)
        }
        function descendsFrom(type: string) {
            let curr = node.parent;
            while (curr) {
                if (curr.type == type)
                    return true
                curr = curr.parent;
            }
            return false
        }
        node.children.forEach(c => visit(c));
        if (["=", "|", "=>", ":"].indexOf(node.type) > -1) {
            mkToken('keyword');
            return;
        }
        if (node.type == 'tyvar') {
            mkToken('variable');
            return;
        }
        if (node.type != 'ident')
            return;
        let parent = node.parent!;
        switch (parent.type) {
            case 'strb':
            case 'strspec':
            case 'fctspec':
            case 'valspec':
            case 'fctb':
            case 'overload_ldec':
                // case 'op_pat':
                mkToken('function');
                break;
            case 'sigb':
            case 'var_sign':
            case 'include_spec':
            case 'fsigb':
            case 'var_fsig':
            case 'transparent_fsigconstraint_op':
            case 'opaque_fsigconstraint_op':
            case 'access_pat':
            case 'access_exp':
                mkToken('struct');
                break;
            case 'dtrepl':
            case 'tyspec':
            case 'tb':
            case 'db':
                mkToken('type');
                break;
            case 'fparam':
            case 'plabel':
                // mkToken('type');
                mkToken("parameter")
                break;
            case 'selector':
                if (parent.parent!.type !== 'selector_exp') {
                    mkToken('parameter');
                }
                break;
            case 'var_pat':
                if (parent.parent!.type === 'clause' && !parent.previousSibling) {
                    mkToken('function');
                } else if (descendsFrom('clause')) {
                    if (isUpper(node.text))
                        mkToken('type');
                    else
                        mkToken('parameter');
                } else if (parent.parent!.type === 'app_pat' && parent.parent!.childCount === 1 && parent.parent!.parent!.type === 'vb') {
                    mkToken('function');
                } else {
                    mkToken('type');
                }
                break;
            case 'var_exp':
                if (isUpper(node.text)) {
                    mkToken('type');
                } else if (parent.parent!.type === 'app_exp' && !parent.previousSibling && parent.parent?.childCount != 1) {
                    mkToken('function');
                }
                break;
            case 'exnspec':
            case 'constr':
            case 'eb':
                mkToken('type');
                break;

            case 'qident':
                if (node.nextSibling) {
                    mkToken('struct');
                } else if (descendsFrom('con_ty')) {
                    mkToken('type');
                } else {
                    let gparent = parent.parent!;
                    switch (gparent.type) {
                        case 'var_struct':
                        case 'strspec':
                        case 'struct_whspec':
                        case 'var_fct_exp':
                        case 'open_ldec':
                            mkToken('struct');
                            break;
                        case 'app_struct':
                        // case 'sharespec':
                        // case 'con_ty':
                        case 'type_whspec':
                        case 'app_fct_exp':
                            mkToken('type');
                            break;
                        case 'exn_def':
                            mkToken('type');
                            break;
                        case 'access_pat':
                            if (isUpper(node.text)) {
                                mkToken('type');
                            } else {
                                mkToken('type');
                            }
                            break;
                        case 'access_exp':
                            if (isUpper(node.text)) {
                                mkToken('type');
                            }
                            break;
                        default:
                            break;
                    }
                }
                break;

            default:
                break;
        }


    }
    visit(root)
    return builder.build()
}

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  CompletionParams,
  TextDocumentSyncKind,
  InitializeResult,
  URI,
} from "vscode-languageserver/node";
import * as fs from "node:fs";
import * as url from "node:url";
import * as path from "node:path";
import { TextDocument } from "vscode-languageserver-textdocument";
import { json } from "node:stream/consumers";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;


// Warning: this variable mix all workspace TreeSitter node_types 
let node_types_mixed : CompletionItem[] = []

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        triggerCharacters: ["#", "@"],
        resolveProvider: false,
      },
    },
  };

  if (params.workspaceFolders) {
    let ws_uris = params.workspaceFolders.map((f) => f.uri);

    for (let uri of ws_uris) {
      let p = path.join(url.fileURLToPath(uri), "src", "node-types.json");
      let f = fs.readFileSync(p);

      // incomplete definition for TreeSitter node_types.json
      type node_type = {
        type: string;
        named: boolean;
        subtypes: node_type[]; // not need iterate this
      };
      let node_types: node_type[] = JSON.parse(f.toString());
      let set: Set<string> = new Set();

      for (let node of node_types) {
        set.add(node.type);
      }
			for (let name of set) {
				node_types_mixed.push({
					label:name,
					kind: CompletionItemKind.Constructor,
					detail: "TreeSitter Node type"

				})
			}
      
    }
  }

  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }
});

documents.onDidClose((e) => {});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {});

connection.onDidChangeWatchedFiles((_change) => {
  // Monitored files have change in VSCode
  connection.console.log("We received a file change event");
});

// https://docs.helix-editor.com/themes.html#syntax-highlighting
// https://tree-sitter.github.io/tree-sitter/3-syntax-highlighting.html#highlights
let highlight_name = [
  "attribute",
  "comment",
  "constant",
  "constant.builtin",
  "constructor",
  "embedded",
  "function",
  "function.builtin",
  "keyword",
  "module",
  "number",
  "operator",
  "property",
  "property.builtin",
  "punctuation",
  "punctuation.bracket",
  "punctuation.delimiter",
  "punctuation.special",
  "string",
  "string.special",
  "tag",
  "type",
  "type.builtin",
  "variable",
  "variable.builtin",
  "variable.parameter",
];

let eq_predicate = ["eq?", "not-eq?", "any-eq?", "any-not-eq?"];

let predicate = ["match?", "any-of?", "is?"];

let highlight_name_to_completion_item = (name: string): CompletionItem => {
  return {
    label: name,
    kind: CompletionItemKind.Variable,
    detail: "highlight name",
  };
};

let eq_predicate_to_completion_item = (name: string): CompletionItem => {
  return {
    label: name,
    kind: CompletionItemKind.Function,
    detail: "eq? predicate",
  };
};

let predicate_to_completion_item = (name: string): CompletionItem => {
  return {
    label: name,
    kind: CompletionItemKind.Function,
    detail: "predicate",
  };
};

let pred_items = [
  ...eq_predicate.map(eq_predicate_to_completion_item),
  ...predicate.map(predicate_to_completion_item),
];

let hl_items = highlight_name.map(highlight_name_to_completion_item);

// This handler provides the initial list of the completion items.
connection.onCompletion((comp_item: CompletionParams): CompletionItem[] => {
  if (comp_item.context != undefined) {
    let ch = comp_item.context.triggerCharacter;
    if (ch == "@") {
      return hl_items;
    }
    if (ch == "#") {
      return pred_items;
    } else {
			return node_types_mixed;
		}
  } else {
    return [];
  }
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

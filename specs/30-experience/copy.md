# Copy

Tone: short, plain, specific; say what happened and what to do. Placeholders in `{braces}`.

## Actions & labels
| ID | Text | Notes |
|---|---|---|
| **COPY-action.open** | Open file | |
| **COPY-action.clear** | Clear | |
| **COPY-action.beautify** | Beautify | |
| **COPY-action.minify** | Minify | |
| **COPY-action.reindent** | Re-indent | Changes indentation only |
| **COPY-action.copy** | Copy | Whole document |
| **COPY-action.download** | Download | |
| **COPY-action.cancel** | Cancel | |
| **COPY-action.continue** | Continue | |
| **COPY-action.more** | More actions | Overflow menu label |
| **COPY-action.copy_path** | Copy path | |
| **COPY-action.copy_value** | Copy value | |
| **COPY-action.reveal** | Show in text | |
| **COPY-action.collapse_all** | Collapse all | |
| **COPY-action.find** | Find | |
| **COPY-action.find_next** | Next match | |
| **COPY-action.find_prev** | Previous match | |
| **COPY-action.close** | Close | |
| **COPY-action.dismiss** | Dismiss | |
| **COPY-action.go_to_error** | Go to error | |
| **COPY-action.collapse_issues** | Hide issues | |
| **COPY-action.expand_issues** | Show issues | |
| **COPY-label.indent** | Indent | |
| **COPY-label.editor** | JSON document | Accessible name of the editor |
| **COPY-label.toolbar** | Document actions | Accessible name of the toolbar |
| **COPY-label.view** | View | Accessible name of the text/tree switch |
| **COPY-label.issues** | Issues | Accessible name of the issue panel |
| **COPY-label.tree** | Document tree | Accessible name of the tree |
| **COPY-indent.spaces2** | 2 spaces | Default |
| **COPY-indent.spaces4** | 4 spaces | |
| **COPY-indent.tab** | Tab | |
| **COPY-indent.custom** | Custom… ({n} spaces) | n from 1 to 8 |
| **COPY-view.text** | Text | |
| **COPY-view.tree** | Tree | |

## Status
| ID | Text | Notes |
|---|---|---|
| **COPY-status.valid** | Valid JSON | |
| **COPY-status.invalid** | Invalid JSON | |
| **COPY-status.checking** | Checking… | |
| **COPY-status.empty** | Empty | |
| **COPY-status.size_lines** | {size} · {lines} lines | size in B/KB/MB; numbers use the locale's grouping; singular line when lines is 1 |
| **COPY-status.size_lines_short** | {size} · {lines} ln | narrow status bar (under 600 px) |
| **COPY-status.valid_warnings** | Valid JSON · {count} warnings | when warnings exist; singular warning when count is 1 |
| **COPY-status.cursor** | Ln {line}, Col {column} | |
| **COPY-issue.error** | Error | severity badge |
| **COPY-issue.warning** | Warning | severity badge |
| **COPY-issue.tab_problems** | Problems ({count}) | |
| **COPY-issue.tab_warnings** | Warnings ({count}) | |
| **COPY-issue.location** | Line {line}, column {column} | numbers use the locale's grouping |
| **COPY-issue.more** | …and {count} more warnings | singular warning when count is 1 |

## Empty, progress, notices, errors
| ID | Text | Notes |
|---|---|---|
| **COPY-empty.title** | Paste JSON, drop a file, or open one | |
| **COPY-empty.body** | Everything runs in your browser. Nothing is uploaded. | |
| **COPY-drop.hint** | Drop a file to open it | |
| **COPY-progress.loading** | Reading file… {percent}% | |
| **COPY-progress.formatting** | Formatting… {percent}% | |
| **COPY-progress.tree** | Building tree… {percent}% | |
| **COPY-progress.exporting** | Preparing… {percent}% | Copy and download |
| **COPY-progress.inserting** | Adding pasted text… {percent}% | large paste |
| **COPY-progress.restoring** | Restoring… {percent}% | undo of a large-tier operation |
| **COPY-notice.large** | Large document ({size}): some highlighting is turned off to keep things fast. | |
| **COPY-notice.multiple_files** | Only the first file was opened. | |
| **COPY-notice.no_indent** | No indentation found to change. Try Beautify instead. | |
| **COPY-confirm.title** | Large content | dialog title |
| **COPY-confirm.very_large** | This content is {size}. Working with it may be slow or run out of memory. Continue anyway? | Buttons: COPY-action.continue, COPY-action.cancel |
| **COPY-error.unreadable** | This file couldn't be read. Your previous document is unchanged. | |
| **COPY-error.failed** | Something went wrong, so nothing was changed. Try again. | unexpected internal failure |
| **COPY-error.too_large** | This file is too large for this device's memory. Your previous document is unchanged. | |
| **COPY-error.download** | Downloads aren't allowed here. Use Copy instead, or open the tool on its own. | deprecated (D-023), not shown |
| **COPY-notice.undo_trimmed** | Large document: only the last 3 operations can be undone. | |
| **COPY-error.encoding** | This file isn't UTF-8 text, so it wasn't opened. | |
| **COPY-error.not_a_file** | Only files can be dropped here. | |
| **COPY-error.clipboard** | Copying isn't allowed here. The text is selected — press your copy shortcut. | |
| **COPY-toast.copied** | Copied | |
| **COPY-tree.checking** | Updating tree… | |
| **COPY-tree.too_large** | This document is too large for the tree view on this device. Use the text view. | |
| **COPY-tree.kind_object** | object | |
| **COPY-tree.kind_array** | array | |
| **COPY-tree.kind_string** | string | |
| **COPY-tree.kind_number** | number | |
| **COPY-tree.kind_boolean** | boolean | |
| **COPY-tree.kind_null** | null | |
| **COPY-tree.count_keys** | {count} keys | 1 key when count is 1 |
| **COPY-tree.count_items** | {count} items | 1 item when count is 1 |
| **COPY-tree.group** | [{from} … {to}] | group row label |
| **COPY-tree.invalid** | The tree needs valid JSON. Fix the error first. | Action: jump to error |

## Find
| ID | Text | Notes |
|---|---|---|
| **COPY-search.placeholder** | Find in document | |
| **COPY-search.match_case** | Match case | |
| **COPY-search.count** | {current} of {total} | |
| **COPY-search.counting** | {current} of {total}+ | while counting |
| **COPY-search.none** | No matches | |

## Privacy
| ID | Text | Notes |
|---|---|---|
| **COPY-privacy.badge** | Local only | Short form |
| **COPY-privacy.badge_label** | Your data stays in this browser | Accessible name of the badge |
| **COPY-privacy.details** | This tool runs entirely in your browser. Your JSON is never uploaded, logged, or stored, and the tool sends no analytics. Closing the page discards it. | |
| **COPY-privacy.notices** | Open-source notices | Link in the privacy details to the open-source licence notices |
| **COPY-privacy.source** | Source code | Visible text of the source link, after the GitHub mark (F-009.R3) |
| **COPY-privacy.source_label** | Source code on GitHub | Accessible name and tooltip of the source link; contains COPY-privacy.source (F-009.R3) |

## Hints (one per issue code, RULE-04 / RULE-05)
| ID | Text | Notes |
|---|---|---|
| **COPY-hint.trailing_comma** | Remove the comma after the last item — JSON doesn't allow trailing commas. | |
| **COPY-hint.comment** | JSON doesn't allow comments. Remove this comment. | |
| **COPY-hint.single_quotes** | Use double quotes (") for strings and keys. | |
| **COPY-hint.unquoted_key** | Put the key in double quotes, e.g. "name". | |
| **COPY-hint.missing_comma** | Add a comma between these items. | |
| **COPY-hint.missing_colon** | Add a colon (:) between the key and its value. | |
| **COPY-hint.unclosed_string** | This string has no closing quote. | |
| **COPY-hint.unclosed_container** | The {bracket} opened on line {line} is never closed. | |
| **COPY-hint.unexpected_closing** | This {bracket} has no matching opening bracket. | |
| **COPY-hint.invalid_literal** | Use true, false, or null (lowercase). NaN, Infinity and undefined aren't valid JSON. | |
| **COPY-hint.invalid_number** | Numbers can't have leading zeros, a leading + or a bare decimal point. | |
| **COPY-hint.invalid_escape** | Only \" \\ \/ \b \f \n \r \t and \uXXXX escapes are allowed. | |
| **COPY-hint.control_character** | Control characters (like a raw tab or line break) must be escaped inside strings. | |
| **COPY-hint.extra_content** | There's more after the end of the JSON value. Remove it or wrap the values in an array. | |
| **COPY-hint.empty_document** | The document only contains whitespace. | |
| **COPY-hint.too_deep** | This is nested more than 10,000 levels deep, which isn't supported. | |
| **COPY-hint.unexpected_character** | This character isn't valid here. | |
| **COPY-hint.duplicate_key** | This key appears more than once in the same object. Many parsers keep only the last one. | |
| **COPY-hint.unsafe_number** | This number is kept exactly here, but many languages (including JavaScript) will round it. | |
| **COPY-hint.byte_order_mark** | The document starts with a byte-order mark. It's kept, but some tools reject it. | |

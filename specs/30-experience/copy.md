# Copy

Tone: short, plain, specific; say what happened and what to do. Placeholders in `{braces}`.
One text column per supported language (RULE-19, F-012); every language has the same
placeholders. Stay as written in every language: the tree's value kinds, literal JSON tokens
(`true`, `false`, `null`, escape sequences, `NaN`, `Infinity`, `undefined`), "JSON", "GitHub" and
the product name. Prose nouns in sentences are translated (string → chuỗi, array → mảng,
object → đối tượng).

## Actions & labels
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-action.open** | Open file | Mở tệp | |
| **COPY-action.clear** | Clear | Xoá | |
| **COPY-action.beautify** | Beautify | Làm đẹp | |
| **COPY-action.minify** | Minify | Nén | |
| **COPY-action.reindent** | Re-indent | Thụt lề lại | Changes indentation only |
| **COPY-action.copy** | Copy | Sao chép | Whole document |
| **COPY-action.download** | Download | Tải xuống | |
| **COPY-action.cancel** | Cancel | Huỷ | |
| **COPY-action.continue** | Continue | Tiếp tục | |
| **COPY-action.more** | More actions | Thao tác khác | Overflow menu label |
| **COPY-action.copy_path** | Copy path | Sao chép đường dẫn | |
| **COPY-action.copy_value** | Copy value | Sao chép giá trị | |
| **COPY-action.reveal** | Show in text | Hiện trong văn bản | |
| **COPY-action.collapse_all** | Collapse all | Thu gọn tất cả | |
| **COPY-action.find** | Find | Tìm | |
| **COPY-action.find_next** | Next match | Kết quả tiếp theo | |
| **COPY-action.find_prev** | Previous match | Kết quả trước | |
| **COPY-action.close** | Close | Đóng | |
| **COPY-action.dismiss** | Dismiss | Bỏ qua | |
| **COPY-action.go_to_error** | Go to error | Đến lỗi | |
| **COPY-action.collapse_issues** | Hide issues | Ẩn vấn đề | |
| **COPY-action.expand_issues** | Show issues | Hiện vấn đề | |
| **COPY-label.indent** | Indent | Thụt lề | |
| **COPY-label.editor** | JSON document | Tài liệu JSON | Accessible name of the editor |
| **COPY-label.toolbar** | Document actions | Thao tác với tài liệu | Accessible name of the toolbar |
| **COPY-label.view** | View | Chế độ xem | Accessible name of the text/tree switch |
| **COPY-label.issues** | Issues | Vấn đề | Accessible name of the issue panel |
| **COPY-label.tree** | Document tree | Cây tài liệu | Accessible name of the tree |
| **COPY-indent.spaces2** | 2 spaces | 2 dấu cách | Default |
| **COPY-indent.spaces4** | 4 spaces | 4 dấu cách | |
| **COPY-indent.tab** | Tab | Tab | |
| **COPY-indent.custom** | Custom… ({n} spaces) | Tuỳ chỉnh… ({n} dấu cách) | n from 1 to 8 |
| **COPY-view.text** | Text | Văn bản | |
| **COPY-view.tree** | Tree | Cây | |

## Status
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-status.valid** | Valid JSON | JSON hợp lệ | |
| **COPY-status.invalid** | Invalid JSON | JSON không hợp lệ | |
| **COPY-status.checking** | Checking… | Đang kiểm tra… | |
| **COPY-status.empty** | Empty | Trống | |
| **COPY-status.size_lines** | {size} · {lines} lines | {size} · {lines} dòng | size in B/KB/MB; numbers use the active language's grouping; en-US: singular line when lines is 1 |
| **COPY-status.size_lines_short** | {size} · {lines} ln | {size} · {lines} dòng | narrow status bar (under 600 px) |
| **COPY-status.valid_warnings** | Valid JSON · {count} warnings | JSON hợp lệ · {count} cảnh báo | when warnings exist; en-US: singular warning when count is 1 |
| **COPY-status.cursor** | Ln {line}, Col {column} | Dòng {line}, cột {column} | |
| **COPY-issue.error** | Error | Lỗi | severity badge |
| **COPY-issue.warning** | Warning | Cảnh báo | severity badge |
| **COPY-issue.tab_problems** | Problems ({count}) | Lỗi ({count}) | |
| **COPY-issue.tab_warnings** | Warnings ({count}) | Cảnh báo ({count}) | |
| **COPY-issue.location** | Line {line}, column {column} | Dòng {line}, cột {column} | numbers use the active language's grouping |
| **COPY-issue.more** | …and {count} more warnings | …và {count} cảnh báo khác | en-US: singular warning when count is 1 |

## Empty, progress, notices, errors
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-empty.title** | Paste JSON, drop a file, or open one | Dán JSON, thả tệp vào, hoặc mở một tệp | |
| **COPY-empty.body** | Everything runs in your browser. Nothing is uploaded. | Mọi thứ chạy trong trình duyệt của bạn. Không có gì được tải lên. | |
| **COPY-drop.hint** | Drop a file to open it | Thả tệp vào để mở | |
| **COPY-progress.loading** | Reading file… {percent}% | Đang đọc tệp… {percent}% | |
| **COPY-progress.formatting** | Formatting… {percent}% | Đang định dạng… {percent}% | |
| **COPY-progress.tree** | Building tree… {percent}% | Đang dựng cây… {percent}% | |
| **COPY-progress.exporting** | Preparing… {percent}% | Đang chuẩn bị… {percent}% | Copy and download |
| **COPY-progress.inserting** | Adding pasted text… {percent}% | Đang thêm văn bản đã dán… {percent}% | large paste |
| **COPY-progress.restoring** | Restoring… {percent}% | Đang khôi phục… {percent}% | undo of a large-tier operation |
| **COPY-notice.large** | Large document ({size}): some highlighting is turned off to keep things fast. | Tài liệu lớn ({size}): một số phần tô màu đã được tắt để giữ tốc độ. | |
| **COPY-notice.multiple_files** | Only the first file was opened. | Chỉ tệp đầu tiên được mở. | |
| **COPY-notice.no_indent** | No indentation found to change. Try Beautify instead. | Không tìm thấy thụt lề để thay đổi. Hãy thử Làm đẹp. | |
| **COPY-confirm.title** | Large content | Nội dung lớn | dialog title |
| **COPY-confirm.very_large** | This content is {size}. Working with it may be slow or run out of memory. Continue anyway? | Nội dung này có dung lượng {size}. Xử lý có thể chậm hoặc hết bộ nhớ. Vẫn tiếp tục? | Buttons: COPY-action.continue, COPY-action.cancel |
| **COPY-error.unreadable** | This file couldn't be read. Your previous document is unchanged. | Không đọc được tệp này. Tài liệu trước đó của bạn vẫn giữ nguyên. | |
| **COPY-error.failed** | Something went wrong, so nothing was changed. Try again. | Đã xảy ra lỗi nên không có gì thay đổi. Hãy thử lại. | unexpected internal failure |
| **COPY-error.too_large** | This file is too large for this device's memory. Your previous document is unchanged. | Tệp này quá lớn so với bộ nhớ của thiết bị. Tài liệu trước đó của bạn vẫn giữ nguyên. | |
| **COPY-error.download** | Downloads aren't allowed here. Use Copy instead, or open the tool on its own. | Không được phép tải xuống ở đây. Hãy dùng Sao chép, hoặc mở riêng công cụ. | deprecated (D-023), not shown |
| **COPY-notice.undo_trimmed** | Large document: only the last 3 operations can be undone. | Tài liệu lớn: chỉ có thể hoàn tác 3 thao tác gần nhất. | |
| **COPY-error.encoding** | This file isn't UTF-8 text, so it wasn't opened. | Tệp này không phải văn bản UTF-8 nên không được mở. | |
| **COPY-error.not_a_file** | Only files can be dropped here. | Chỉ có thể thả tệp vào đây. | |
| **COPY-error.clipboard** | Copying isn't allowed here. The text is selected — press your copy shortcut. | Không được phép sao chép ở đây. Văn bản đã được chọn — hãy nhấn phím tắt sao chép. | |
| **COPY-toast.copied** | Copied | Đã sao chép | |
| **COPY-tree.checking** | Updating tree… | Đang cập nhật cây… | |
| **COPY-tree.too_large** | This document is too large for the tree view on this device. Use the text view. | Tài liệu này quá lớn để xem dạng cây trên thiết bị này. Hãy dùng chế độ văn bản. | |
| **COPY-tree.kind_object** | object | object | |
| **COPY-tree.kind_array** | array | array | |
| **COPY-tree.kind_string** | string | string | |
| **COPY-tree.kind_number** | number | number | |
| **COPY-tree.kind_boolean** | boolean | boolean | |
| **COPY-tree.kind_null** | null | null | |
| **COPY-tree.count_keys** | {count} keys | {count} khoá | en-US: 1 key when count is 1 |
| **COPY-tree.count_items** | {count} items | {count} phần tử | en-US: 1 item when count is 1 |
| **COPY-tree.group** | [{from} … {to}] | [{from} … {to}] | group row label |
| **COPY-tree.invalid** | The tree needs valid JSON. Fix the error first. | Chế độ cây cần JSON hợp lệ. Hãy sửa lỗi trước. | Action: jump to error |

## Find
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-search.placeholder** | Find in document | Tìm trong tài liệu | |
| **COPY-search.match_case** | Match case | Phân biệt hoa thường | |
| **COPY-search.count** | {current} of {total} | {current} / {total} | |
| **COPY-search.counting** | {current} of {total}+ | {current} / {total}+ | while counting |
| **COPY-search.none** | No matches | Không có kết quả | |

## Privacy
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-privacy.badge** | Local only | Chỉ trên máy | Short form |
| **COPY-privacy.badge_label** | Your data stays in this browser | Dữ liệu của bạn chỉ ở trong trình duyệt này | Accessible name of the badge |
| **COPY-privacy.details** | This tool runs entirely in your browser. Your JSON is never uploaded, logged, or stored, and the tool sends no analytics. Closing the page discards it. | Công cụ này chạy hoàn toàn trong trình duyệt của bạn. JSON của bạn không bao giờ được tải lên, ghi lại hay lưu trữ, và công cụ không gửi dữ liệu phân tích. Đóng trang là dữ liệu bị xoá. | |
| **COPY-privacy.notices** | Open-source notices | Giấy phép mã nguồn mở | Link in the privacy details to the open-source licence notices |
| **COPY-privacy.source** | Source code | Mã nguồn | Visible text of the source link, after the GitHub mark (F-009.R3) |
| **COPY-privacy.source_label** | Source code on GitHub | Mã nguồn trên GitHub | Accessible name and tooltip of the source link; contains COPY-privacy.source (F-009.R3) |

## Hints (one per issue code, RULE-04 / RULE-05)
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-hint.trailing_comma** | Remove the comma after the last item — JSON doesn't allow trailing commas. | Xoá dấu phẩy sau phần tử cuối — JSON không cho phép dấu phẩy thừa ở cuối. | |
| **COPY-hint.comment** | JSON doesn't allow comments. Remove this comment. | JSON không cho phép chú thích. Hãy xoá chú thích này. | |
| **COPY-hint.single_quotes** | Use double quotes (") for strings and keys. | Dùng dấu nháy kép (") cho chuỗi và khoá. | |
| **COPY-hint.unquoted_key** | Put the key in double quotes, e.g. "name". | Đặt khoá trong dấu nháy kép, ví dụ "name". | |
| **COPY-hint.missing_comma** | Add a comma between these items. | Thêm dấu phẩy giữa các phần tử này. | |
| **COPY-hint.missing_colon** | Add a colon (:) between the key and its value. | Thêm dấu hai chấm (:) giữa khoá và giá trị. | |
| **COPY-hint.unclosed_string** | This string has no closing quote. | Chuỗi này thiếu dấu nháy đóng. | |
| **COPY-hint.unclosed_container** | The {bracket} opened on line {line} is never closed. | Dấu {bracket} mở ở dòng {line} chưa được đóng. | |
| **COPY-hint.unexpected_closing** | This {bracket} has no matching opening bracket. | Dấu {bracket} này không có dấu mở tương ứng. | |
| **COPY-hint.invalid_literal** | Use true, false, or null (lowercase). NaN, Infinity and undefined aren't valid JSON. | Dùng true, false hoặc null (chữ thường). NaN, Infinity và undefined không phải JSON hợp lệ. | |
| **COPY-hint.invalid_number** | Numbers can't have leading zeros, a leading + or a bare decimal point. | Số không được có số 0 ở đầu, dấu + ở đầu hoặc dấu thập phân đứng một mình. | |
| **COPY-hint.invalid_escape** | Only \" \\ \/ \b \f \n \r \t and \uXXXX escapes are allowed. | Chỉ cho phép các chuỗi thoát \" \\ \/ \b \f \n \r \t và \uXXXX. | |
| **COPY-hint.control_character** | Control characters (like a raw tab or line break) must be escaped inside strings. | Ký tự điều khiển (như tab hay xuống dòng thô) phải được thoát trong chuỗi. | |
| **COPY-hint.extra_content** | There's more after the end of the JSON value. Remove it or wrap the values in an array. | Còn nội dung sau khi giá trị JSON kết thúc. Hãy xoá nó hoặc đặt các giá trị vào một mảng. | |
| **COPY-hint.empty_document** | The document only contains whitespace. | Tài liệu chỉ chứa khoảng trắng. | |
| **COPY-hint.too_deep** | This is nested more than 10,000 levels deep, which isn't supported. | Tài liệu lồng sâu hơn 10.000 cấp, mức này không được hỗ trợ. | |
| **COPY-hint.unexpected_character** | This character isn't valid here. | Ký tự này không hợp lệ ở đây. | |
| **COPY-hint.duplicate_key** | This key appears more than once in the same object. Many parsers keep only the last one. | Khoá này xuất hiện nhiều lần trong cùng một đối tượng. Nhiều trình phân tích chỉ giữ lại lần cuối. | |
| **COPY-hint.unsafe_number** | This number is kept exactly here, but many languages (including JavaScript) will round it. | Số này được giữ chính xác ở đây, nhưng nhiều ngôn ngữ (kể cả JavaScript) sẽ làm tròn nó. | |
| **COPY-hint.byte_order_mark** | The document starts with a byte-order mark. It's kept, but some tools reject it. | Tài liệu bắt đầu bằng dấu thứ tự byte (BOM). Nó được giữ lại, nhưng một số công cụ từ chối nó. | |

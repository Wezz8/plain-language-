# Standard library

All calls wait for their result. Positions start at 1. Optional arguments are described in each row.

| Call | Behaviour |
| --- | --- |
| `length(value)` | Count Unicode characters, list items, or record fields. |
| `type(value)` | Return number, text, boolean, nothing, list, record, or function. |
| `copy(value)` | Deep-copy lists and records. Functions keep their identity. |
| `number(value)` | Convert numeric text to a number; invalid text raises NUMBER_ERROR. |
| `text(value)` | Turn a value into readable text. Records and lists show their contents. |
| `range(end)` | Build [1, …, end]. Also accepts range(start, end, step). Both ends are included; zero produces an empty list. |
| `keys(record)` | Return field names in insertion order. |
| `values(record)` | Return field values in insertion order. |
| `has(value, item)` | Check a record field name, list item, or text substring. |
| `get(record, field, fallback)` | Read a field, returning the optional fallback when it is missing. The default fallback is nothing. |
| `text.upper(value)` | Convert text to uppercase. |
| `text.lower(value)` | Convert text to lowercase. |
| `text.trim(value)` | Remove whitespace at both ends. |
| `text.contains(value, part)` | Check whether text contains a substring. |
| `text.starts(value, part)` | Check the start of text. |
| `text.ends(value, part)` | Check the end of text. |
| `text.split(value, separator)` | Split into a list. An empty separator splits Unicode characters. |
| `text.lines(value)` | Split CRLF, LF, or CR line endings into a list. |
| `text.slice(value, start, end)` | Read a range of characters, starting at 1. The optional end is included. |
| `text.replace(value, find, replacement)` | Replace every exact occurrence. The search text must not be empty. |
| `text.repeat(value, count)` | Repeat text a nonnegative whole number of times. |
| `list.first(items)` | Return the first item, or nothing for an empty list. |
| `list.last(items)` | Return the last item, or nothing for an empty list. |
| `list.slice(items, start, end)` | Copy an inclusive range, starting at 1. End is optional; start can be length + 1 for an empty slice. |
| `list.join(items, separator)` | Join readable values as text. The default separator is a comma and a space. |
| `list.reverse(items)` | Return a reversed copy; the input is unchanged. |
| `list.sum(items)` | Add a list of numbers; an empty list totals zero. |
| `list.unique(items)` | Return unique items in their original order, using structural equality. |
| `list.map(items, action)` | Call action(item) for every item and collect the results. |
| `list.filter(items, action)` | Keep items for which action(item) gives true. |
| `list.find(items, action)` | Return the first matching item, or nothing. |
| `list.some(items, action)` | True when at least one item matches. Stops at the first match. |
| `list.every(items, action)` | True when every item matches. An empty list gives true. |
| `list.reduce(items, initial, action)` | Combine items by calling action(result, item), beginning with initial. |
| `list.sort(items, action)` | Return a stable ascending copy of numbers or text. An optional action(item) supplies a sort key. Text uses Unicode string order. |
| `math.abs(value)` | Absolute value. |
| `math.floor(value)` | Round down to a whole number. |
| `math.ceil(value)` | Round up to a whole number. |
| `math.sqrt(value)` | Square root of a nonnegative number. |
| `math.sin(value)` | Sine, with the angle in radians. |
| `math.cos(value)` | Cosine, with the angle in radians. |
| `math.tan(value)` | Tangent, with the angle in radians. |
| `math.log(value)` | Natural logarithm of a positive number. |
| `math.round(value, places)` | Round to 0–15 decimal places; places defaults to zero. Halfway values follow JavaScript rounding toward positive infinity. |
| `math.power(base, exponent)` | Raise a number to a power. |
| `math.min(items)` | Smallest number in a nonempty list. Also accepts math.min(a, b). |
| `math.max(items)` | Largest number in a nonempty list. Also accepts math.max(a, b). |
| `math.clamp(value, low, high)` | Keep a number between low and high, including the limits. |
| `json.read(text)` | Parse JSON into Plain data. JSON null becomes nothing. Invalid input raises JSON_ERROR. |
| `json.write(value, pretty)` | Serialize data as JSON. Optional pretty=true adds indentation. Functions are not serializable. |
| `time.now()` | Current UTC timestamp as ISO text. |
| `time.stamp()` | Milliseconds since the Unix epoch. |
| `time.date(value)` | UTC date as YYYY-MM-DD. With no argument, use today; otherwise accept date text understood by JavaScript Date. |
| `time.sleep(milliseconds)` | Wait for 0–600,000 milliseconds; Stop cancels the wait. Returns nothing. |
| `random.number()` | A pseudorandom number from 0 up to, but not including, 1. Not a cryptographic generator. |
| `random.integer(low, high)` | A pseudorandom whole number including both limits. |
| `random.pick(items)` | Choose one item from a nonempty list. |
| `files.read(path)` | Read a UTF-8 project file. Terminal reads are limited to 5 MB. |
| `files.write(path, text)` | Create or replace a UTF-8 project file. Create parent folders with files.mkdir first in the terminal. |
| `files.append(path, text)` | Append UTF-8 text, creating the file if needed. |
| `files.exists(path)` | Check whether a project file or folder exists. |
| `files.list(path)` | List immediate child names in sorted order. Path defaults to the project root. |
| `files.remove(path)` | Remove one file. Does not delete folders recursively. Studio entry files are protected. |
| `files.mkdir(path)` | Create a project folder, including parent folders. |
| `http.get(url)` | GET a URL and return {status, ok, body, headers}. Requires HTTP to be enabled. |
| `http.send(method, url, body, headers)` | Send an HTTP request. Body and headers are optional; record/list bodies are JSON-encoded. Set Content-Type explicitly when needed. |
| `http.json(url)` | GET and parse JSON, raising HTTP_ERROR when the server returns a non-success status. |

## Values and constants

`math.pi`, `math.e`, `system.version`, `system.platform`, and `system.args` are read-only library values.

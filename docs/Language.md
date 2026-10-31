# The Plain language

Plain is a dynamically typed programming language for readable programs. You write exact, small commands rather than unrestricted English. Version 1.0 includes reusable actions, structured data, modules, loops, exceptions, a standard library, and tests. The same interpreter runs in the offline Studio and in Node.js.

## Your first program

```plain
set name to "Ada"
say "Hello,", name

repeat 3 times
  say "I made this."
end
```

Use one command per line. Commands and names are case-sensitive. Commands use lowercase. Blank lines are ignored. A comment starts with `#`, except inside quoted text. Indentation helps people read; the word `end` closes a block. Lists, records, function calls, and grouped expressions can span several lines inside brackets.

## Values and names

| Kind | Examples |
| --- | --- |
| number | `10`, `3.5`, `-2`, `1e3` |
| text | `"Hello"`, `"a line\nthen another"` |
| boolean | `true`, `false` |
| nothing | `nothing` |
| list | `[10, 20, 30]` |
| record | `{name: "Ada", score: 10}` |
| function | An action created with `make`, or a library function |

`set` creates or changes a name. A name starts with an ASCII letter and can contain letters, digits, and underscores. Examples: `score`, `first_name`, `player2`. Language keywords cannot be names. A name must have a value before you read it. Names may hold different kinds of values at different times.

```plain
set score to 10
set score to score + 5
say score
```

Text uses double quotes. Escapes follow JSON rules, including `\n`, `\r`, `\t`, `\"`, `\\`, and `\uXXXX`. Text positions count Unicode code points, so an emoji counts as one position; a combined grapheme can contain several code points. Text is immutable: create a new text value to change it.

## Calculations and output

Use `+`, `-`, `*`, `/`, and `%`. `%` gives the remainder. Parentheses group calculations. `+` joins text when either side is text, and concatenates two lists. Other arithmetic needs numbers. Dividing by zero raises an error.

```plain
say 2 + 3 * 4
say (2 + 3) * 4
say 7 % 3
say "Score: " + 10
say "Score:", 10
say [1, 2] + [3]
```

`say` prints a line. Separate expressions with commas to place a space between them. To print a blank line, use `say ""`. Lists and records have readable representations; use `json.write` when you need JSON instead.

## Choices

```plain
if score is at least 80
  say "Excellent"
else if score is at least 50
  say "Passed"
else
  say "Try again"
end
```

| Comparison | Meaning |
| --- | --- |
| `a is b` | Equal values |
| `a is not b` | Different values |
| `a is more than b` | Greater than |
| `a is less than b` | Less than |
| `a is at least b` | Greater than or equal |
| `a is at most b` | Less than or equal |

Equality is strict: number `18` differs from text `"18"`. Lists and records compare their contents recursively; record field order does not affect equality. Functions compare by identity. Ordering comparisons need numbers.

Combine conditions with `not`, `and`, and `or`. Conditions must be booleans. A number, text, or list is not implicitly true or false. `and` and `or` stop as soon as the result is known.

```plain
if age is at least 18 and age is less than 65
  say "In range"
end
```

From highest to lowest precedence: calls/fields/positions; unary `+` and `-`; `* / %`; `+ -`; comparisons; `not`; `and`; `or`. Use parentheses to make complicated conditions clear. Chained comparisons such as `1 is less than age is less than 10` are invalid; combine two comparisons with `and`.

## Lists and records

Lists preserve order. **Positions start at 1.** Reading or changing an invalid position raises an error. Record field names can be identifiers or quoted text. Missing fields raise an error; `has` and `get` let you handle optional fields.

```plain
set people to [
  {name: "Ada", score: 92},
  {name: "Sam", score: 78}
]

say people[1].name
set people[2].score to 85
add {name: "Jo", score: 90} to people
remove people[1]

set details to {"full name": "Ada Okafor"}
say details["full name"]
say get(details, "nickname", "No nickname yet")
```

`add value to items` appends one item. `remove items[2]` removes an item and shifts later positions left. `remove person.name` removes a field. Setting a new record field creates it. Setting a list position must use an existing position; use `add` to append.

Lists and records are shared by reference. `set second to first` gives both names the same data. Use `copy(first)` for an independent, deep copy. Cyclic structures are rejected. Library/module namespaces are read-only; exported data records can still be shared and changed.

## Loops

```plain
repeat 3 times
  say "Hello"
end

for person at position in people
  say position, person.name
end

set count to 1
while count is at most 5
  say count
  set count to count + 1
end
```

`repeat` reads its count once. The count must be a whole number, zero or more. `for item in items` visits list items or text characters. Optional `at position` names the current 1-based position. Iteration uses a shallow snapshot: adding/removing list entries does not change the current traversal; changes to shared record fields remain visible.

`while condition` checks before each iteration. `skip` moves to the next iteration of the nearest loop. `stop` leaves that loop. They do not stop the whole application; the Studio Stop button cancels the application. Loop names remain in the current scope after a loop. To walk through a record, use `for field in keys(record)`.

## Reusable actions

```plain
make total(prices)
  give list.sum(prices)
end

say total([10, 20, 5])
```

Define an action with `make name(parameters)` and call it with parentheses. Define it before calling it. `give value` returns immediately; `give` alone returns `nothing`. An action that reaches its end also gives `nothing`. Argument counts must match exactly. Recursion works; give recursive actions a stopping condition.

Each call has local parameters and local assignments. Actions can read outer names, but `set score to 10` inside an action creates/changes its local `score`, leaving an outer `score` alone. Changing a shared record/list field intentionally changes that data. `if`, `for`, `while`, `repeat`, and `try` do not create new scopes.

Actions capture their lexical surroundings and can be passed around or returned:

```plain
make multiplier(factor)
  make apply(value)
    give value * factor
  end
  give apply
end

set twice to multiplier(2)
say list.map([1, 2, 3], twice)
```

Calls wait for their result, including file access, HTTP, and sleeping. You do not need async/await syntax. Collection callbacks also run sequentially. This version has no native threads or parallel-execution primitive.

## Questions

```plain
ask "What is your name?" into name
ask number "How many?" into count
say "Hello,", name
```

`ask` returns text. `ask number` requires a finite numeric answer. In Studio, invalid numeric input stays in the answer box so you can correct it. The terminal reports invalid numeric input as a program error. End-of-input cancels the program. For an explicit conversion elsewhere, use `number("12.5")`.

## Modules

```plain
use "helpers.plain" as helpers
say helpers.double(12)
```

An imported file runs once per program run. Its top-level names become fields of the namespace: actions, values, and imported namespaces. It has its own scope and shares the standard library. Imports are relative to the importing file. An import cycle is an error. Imported namespace names cannot be replaced through field assignment. A fresh run reloads modules; REPL sessions cache them until `.reset`.

Project files accessed through `files.read` and other file functions are relative to the **project root**, even when called from a module in a subfolder.

## Handling failures

```plain
try
  set config to json.read(files.read("settings.json"))
catch issue
  say issue.message
  set config to {theme: "light"}
finally
  say "Settings step finished"
end
```

`catch issue` receives a record with `message`, `code`, `source`, `line`, and `column`. `catch` or `finally` is required; both are allowed. `finally` runs on ordinary success, failure, `give`, `stop`, and `skip`. An error or return in `finally` replaces the earlier outcome. Cancellation and execution limits stop immediately and bypass further execution, including cleanup blocks.

`fail "message"` raises a `USER_ERROR`. `check condition` raises `CHECK_FAILED` when false; an optional second expression supplies a message: `check total is 10, "Expected ten"`.

Common codes are `UNKNOWN_NAME`, `TYPE_ERROR`, `ARGUMENT_ERROR`, `NUMBER_ERROR`, `INDEX_ERROR`, `FIELD_ERROR`, `MODULE_ERROR`, `MODULE_CYCLE`, `JSON_ERROR`, `HTTP_ERROR`, `HOST_ERROR`, `CAPABILITY_ERROR`, `USER_ERROR`, `CHECK_FAILED`, `READ_ONLY`, `PATH_ERROR`, `CYCLE`, `LIMIT`, and `STOPPED`. Syntax errors use `PLAIN_ERROR`. Cancellation (`STOPPED`) and resource limits (`LIMIT`) cannot be caught by a Plain program.

## Tests

```plain
use "../helpers.plain" as helpers

test "doubling works"
  check helpers.double(6) is 12
end
```

Put tests in files ending in `.test.plain`, then use Run tests in Studio or `plain test` in the terminal. Test blocks are skipped during normal runs. The file's ordinary top-level code runs first, followed by its registered tests. Each test has local assignments, while reads can use file/module values. Shared data is still shared: create or copy mutable fixtures inside each test. A failing check is recorded and the next test continues. Syntax errors, cancellation, and resource limits abort that run.

## The complete command set

| Form | Purpose |
| --- | --- |
| `set target to expression` | Save/change a name, field, or list item |
| `say expression, expression` | Print one or more values |
| `ask [number] question into name` | Read text or a number |
| `if condition / else if condition / else / end` | Choose a branch |
| `repeat count times / end` | Repeat a fixed number of times |
| `for name [at position] in value / end` | Walk through a list or text |
| `while condition / end` | Repeat while true |
| `stop`, `skip` | Leave a loop / advance to its next iteration |
| `make name(parameters) / end` | Define a reusable action |
| `give [expression]` | Return from an action |
| `add expression to list` | Append one item |
| `remove target[field]`, `remove target.field` | Remove an item or field |
| `use "path.plain" as name` | Load a module |
| `try / catch name / finally / end` | Handle a failure |
| `fail text` | Raise an application error |
| `check condition[, message]` | Assert a condition |
| `test "description" / end` | Define a test case |
| `action(arguments)` | Call an action for its effect |

The words in square brackets in this table indicate optional syntax; do not type those brackets unless you are creating/accessing a list. All ordinary expressions are values, names, calls, lists, records, fields, positions, grouped expressions, or the operators described above. There is no JavaScript evaluation or unrestricted host-language access in Plain source.

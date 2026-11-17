Add a `json` export format to the notes CLI so that
`notes export --format json` (and `--format json --all`) works. All tests in
`test_cli.py` and `test_export_json.py` must pass.

The output is one JSON object:

```json
{
  "version": 1,
  "count": 2,
  "notes": [
    {
      "id": 1,
      "title": "...",
      "body": "...",
      "tags": ["a", "b"],
      "created": "2026-03-01T10:00:00Z",
      "updated": null,
      "archived": false
    }
  ]
}
```

- Same notes, in the same order and with the same archived filtering as the
  other export formats. `count` is the number of exported notes.
- `tags` is sorted. `created`/`updated` use the timestamp format the rest of the
  project already uses; `updated` is `null` when a note was never updated.
- Pretty-printed with 2-space indentation, keys in the order shown, non-ASCII
  text written as-is (not `\u` escaped), and a trailing newline.
- Follow the way this codebase adds export formats. Do not special-case `json`
  in the export command or the CLI.

Do not change the tests.

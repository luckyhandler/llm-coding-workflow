Users report that the monthly ledger report (`ledger.report.monthly_report`) is
wrong in three ways:

1. When the report is generated more than once in the same process, the totals
   keep growing.
2. Some late-evening transactions show up in the wrong month.
3. The last transaction in an export is sometimes missing.

`test_report.py` reproduces the symptoms. Find and fix the root causes so all
tests pass.

Rules:
- Reports bucket transactions by their UTC calendar date. Timestamps carry an
  offset (`2026-03-31T23:30:00-02:00`); a timestamp without an offset is UTC.
- Fix each bug in the module where it lives. Do not change `ledger/report.py`,
  and do not work around the bugs in the report layer.
- Keep the public functions and their signatures.

Do not change the tests.

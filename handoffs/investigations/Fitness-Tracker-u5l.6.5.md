# W5 compiler/read integration verification attempts

- Initial typecheck: TS2339 for recipeId/recipeHash on value.basis in a callback.
  Bound the narrowed object before the callback; full typecheck passed.
- First Vitest filename selection also found two retained release copies under
  output. Ten retained-copy tests failed because old mocks lacked current setup
  handling; four current files passed. Added `--exclude 'output/**'`;10 current
  files /157 tests pass. No retained artifact edited.
- Independent review: guard the actual serialized scheduledSessions, bind
  accepted row dates/sequence, preserve separate protocol/week guidance, reject
  malformed explicit formats without legacy fallback, validate hashes/spacing.
  All resolved;112 independently run tests pass.
- Initial320/light and390/dark browser tests passed. Final UI changes tested at
  both sizes plus1280/light:3 pass. No repeated unresolved failure remains.

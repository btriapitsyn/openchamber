import { test } from 'vitest';
import { exerciseDiffHunkActions } from '@openchamber/ui/components/views/DiffView.hunks.fixture';

// The actual view imports Vite asset globs. Run its UI-owned DOM fixture through
// the web renderer's transform pipeline instead of mocking those modules.
test('hunk actions refresh unchanged-status patches, survive full context and exclude historical diffs', () => exerciseDiffHunkActions());
test('full-context and action reads must describe the same file version', () => exerciseDiffHunkActions('cold'));
test('cached action patches cannot be paired with a newer full-context display', () => exerciseDiffHunkActions('cached'));

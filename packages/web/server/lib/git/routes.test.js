import { beforeEach, describe, expect, it, vi } from 'vitest';

const gitLibraries = {
  stageFiles: vi.fn(),
  unstageFiles: vi.fn(),
  isGitRepository: vi.fn(),
  getStatus: vi.fn(),
  getWorktrees: vi.fn(),
  resolveGitCommonDirectory: vi.fn(),
  watchWorktreeChanges: vi.fn(),
};

vi.mock('./index.js', () => ({
  stageFiles: gitLibraries.stageFiles,
  unstageFiles: gitLibraries.unstageFiles,
  isGitRepository: gitLibraries.isGitRepository,
  getStatus: gitLibraries.getStatus,
  getWorktrees: gitLibraries.getWorktrees,
  resolveGitCommonDirectory: gitLibraries.resolveGitCommonDirectory,
  watchWorktreeChanges: gitLibraries.watchWorktreeChanges,
}));

const { registerGitRoutes } = await import('./routes.js');

const createRouteRegistry = () => {
  const routes = new Map();

  return {
    app: {
      get(routePath, handler) {
        routes.set(`GET ${routePath}`, handler);
      },
      post(routePath, handler) {
        routes.set(`POST ${routePath}`, handler);
      },
      put(routePath, handler) {
        routes.set(`PUT ${routePath}`, handler);
      },
      delete(routePath, handler) {
        routes.set(`DELETE ${routePath}`, handler);
      },
    },
    getRoute(method, routePath) {
      return routes.get(`${method} ${routePath}`);
    },
  };
};

const createMockResponse = () => {
  let statusCode = 200;
  let body = null;

  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
};

describe('git routes index mutations', () => {
  beforeEach(() => {
    gitLibraries.stageFiles.mockReset();
    gitLibraries.unstageFiles.mockReset();
    gitLibraries.isGitRepository.mockReset();
    gitLibraries.getStatus.mockReset();
  });

  it('accepts legacy stage path payloads', async () => {
    const { app, getRoute } = createRouteRegistry();
    registerGitRoutes(app);
    const response = createMockResponse();

    await getRoute('POST', '/api/git/stage')(
      { query: { directory: '/repo' }, body: { path: 'a.ts' } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(gitLibraries.stageFiles).toHaveBeenCalledWith('/repo', ['a.ts']);
  });

  it('accepts bulk stage paths payloads', async () => {
    const { app, getRoute } = createRouteRegistry();
    registerGitRoutes(app);
    const response = createMockResponse();

    await getRoute('POST', '/api/git/stage')(
      { query: { directory: '/repo' }, body: { paths: ['a.ts', 'b.ts'] } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(gitLibraries.stageFiles).toHaveBeenCalledWith('/repo', ['a.ts', 'b.ts']);
  });

  it('accepts legacy unstage path payloads', async () => {
    const { app, getRoute } = createRouteRegistry();
    registerGitRoutes(app);
    const response = createMockResponse();

    await getRoute('POST', '/api/git/unstage')(
      { query: { directory: '/repo' }, body: { path: 'a.ts' } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(gitLibraries.unstageFiles).toHaveBeenCalledWith('/repo', ['a.ts']);
  });

  it('accepts bulk unstage paths payloads', async () => {
    const { app, getRoute } = createRouteRegistry();
    registerGitRoutes(app);
    const response = createMockResponse();

    await getRoute('POST', '/api/git/unstage')(
      { query: { directory: '/repo' }, body: { paths: ['a.ts', 'b.ts'] } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(gitLibraries.unstageFiles).toHaveBeenCalledWith('/repo', ['a.ts', 'b.ts']);
  });

  it('rejects invalid path payloads before calling git', async () => {
    const { app, getRoute } = createRouteRegistry();
    registerGitRoutes(app);
    const response = createMockResponse();

    await getRoute('POST', '/api/git/stage')(
      { query: { directory: '/repo' }, body: { paths: [' ', null] } },
      response,
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'path parameter is required' });
    expect(gitLibraries.stageFiles).not.toHaveBeenCalled();
  });
});

describe('git worktree routes', () => {
  beforeEach(() => {
    gitLibraries.getWorktrees.mockReset();
    gitLibraries.resolveGitCommonDirectory.mockReset();
    gitLibraries.watchWorktreeChanges.mockReset();
  });

  it('starts one watcher before listing and emits changes for every repository directory', async () => {
    gitLibraries.getWorktrees.mockResolvedValue([]);
    gitLibraries.resolveGitCommonDirectory.mockResolvedValue('/repo/.git');
    let notifyChange;
    let watcherOptions;
    const disposeWatcher = vi.fn();
    gitLibraries.watchWorktreeChanges.mockImplementation(async (_directory, onChange, options) => {
      notifyChange = onChange;
      watcherOptions = options;
      return disposeWatcher;
    });
    const emitWorktreeChanged = vi.fn();
    const { app, getRoute } = createRouteRegistry();
    const disposeRoutes = registerGitRoutes(app, { emitWorktreeChanged });
    const route = getRoute('GET', '/api/git/worktrees');

    await route({ query: { directory: '/repo' } }, createMockResponse());
    await route({ query: { directory: '/repo-linked' } }, createMockResponse());
    await Promise.resolve();
    notifyChange({ directory: '/repo', at: 123 });

    expect(gitLibraries.watchWorktreeChanges).toHaveBeenCalledTimes(1);
    expect(gitLibraries.watchWorktreeChanges.mock.invocationCallOrder[0])
      .toBeLessThan(gitLibraries.getWorktrees.mock.invocationCallOrder[0]);
    expect(emitWorktreeChanged).toHaveBeenCalledWith('/repo', 123);
    expect(emitWorktreeChanged).toHaveBeenCalledWith('/repo-linked', 123);

    watcherOptions.onError();
    await route({ query: { directory: '/repo' } }, createMockResponse());
    expect(gitLibraries.watchWorktreeChanges).toHaveBeenCalledTimes(2);

    disposeRoutes();
    expect(disposeWatcher).toHaveBeenCalledTimes(2);
  });

  it('returns a failure instead of clearing topology when git cannot list worktrees', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    gitLibraries.resolveGitCommonDirectory.mockRejectedValue(new Error('not available'));
    gitLibraries.getWorktrees.mockRejectedValue(new Error('git failed'));
    const { app, getRoute } = createRouteRegistry();
    registerGitRoutes(app, { emitWorktreeChanged: vi.fn() });
    const response = createMockResponse();

    await getRoute('GET', '/api/git/worktrees')({ query: { directory: '/repo' } }, response);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: 'git failed' });
    errorSpy.mockRestore();
  });
});

describe('git routes status discovery', () => {
  beforeEach(() => {
    gitLibraries.isGitRepository.mockReset();
    gitLibraries.getStatus.mockReset();
  });

  it('returns a soft non-repo payload for non-git folders', async () => {
    gitLibraries.isGitRepository.mockResolvedValue(false);
    const { app, getRoute } = createRouteRegistry();
    registerGitRoutes(app);
    const response = createMockResponse();

    await getRoute('GET', '/api/git/status')(
      { query: { directory: '/tmp/not-a-repo' } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      isGitRepository: false,
      files: [],
      branch: null,
      ahead: 0,
      behind: 0,
    });
    expect(gitLibraries.getStatus).not.toHaveBeenCalled();
  });

  it('does not abort when getStatus throws a non-repo GitError', async () => {
    gitLibraries.isGitRepository.mockResolvedValue(true);
    gitLibraries.getStatus.mockRejectedValue(
      Object.assign(new Error('fatal: not a git repository (or any of the parent directories): .git'), {
        task: { commands: ['status'] },
      }),
    );
    const { app, getRoute } = createRouteRegistry();
    registerGitRoutes(app);
    const response = createMockResponse();

    await getRoute('GET', '/api/git/status')(
      { query: { directory: '/opened/project' } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ isGitRepository: false });
    expect(gitLibraries.getStatus).toHaveBeenCalledWith('/opened/project', { mode: undefined });
  });

  it('uses the opened project path from query arrays without falling back to cwd', async () => {
    gitLibraries.isGitRepository.mockResolvedValue(true);
    gitLibraries.getStatus.mockResolvedValue({ current: 'main', files: [], isClean: true, ahead: 0, behind: 0 });
    const { app, getRoute } = createRouteRegistry();
    registerGitRoutes(app);
    const response = createMockResponse();

    await getRoute('GET', '/api/git/status')(
      { query: { directory: ['/opened/git-project', '/ignored'] } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(gitLibraries.isGitRepository).toHaveBeenCalledWith('/opened/git-project');
    expect(gitLibraries.getStatus).toHaveBeenCalledWith('/opened/git-project', { mode: undefined });
    expect(response.body).toMatchObject({ current: 'main' });
  });
});

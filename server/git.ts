import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const GIT_ENV = {
  GIT_AUTHOR_NAME: "Infinite Dash",
  GIT_AUTHOR_EMAIL: "bot@infinitedash.lol",
  GIT_COMMITTER_NAME: "Infinite Dash",
  GIT_COMMITTER_EMAIL: "bot@infinitedash.lol",
};

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: { ...process.env, ...GIT_ENV },
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout.trim();
}

export async function gitOk(cwd: string, ...args: string[]): Promise<boolean> {
  try {
    await git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}

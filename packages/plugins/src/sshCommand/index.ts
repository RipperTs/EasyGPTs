import { Client } from 'ssh2';
import type { ConnectConfig } from 'ssh2';

type AuthType = 'password' | 'key';

type Props = {
  host: string;
  port?: number;
  username: string;
  auth_type: AuthType;
  password?: string;
  private_key?: string;
  passphrase?: string;
  command: string;
};

type ExecResult = {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
};

type Response = Promise<{
  stdout: string;
  stderr: string;
  success: boolean;
}>;

const getErrorText = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
};

const assertRequiredString = (value: string | undefined, field: string) => {
  if (!value || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
};

const executeCommand = (config: ConnectConfig, command: string): Promise<ExecResult> => {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;

    const safeResolve = (result: ExecResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const safeReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    client
      .on('ready', () => {
        client.exec(command, (error, stream) => {
          if (error) {
            client.end();
            safeReject(error);
            return;
          }

          let stdout = '';
          let stderr = '';

          stream.on('data', (chunk: Buffer) => {
            stdout += chunk.toString('utf8');
          });

          stream.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString('utf8');
          });

          stream.on('close', (code: number | undefined, signal: string | undefined) => {
            client.end();
            safeResolve({
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              code: typeof code === 'number' ? code : null,
              signal: signal ?? null
            });
          });

          stream.on('error', (streamError: Error) => {
            client.end();
            safeReject(streamError);
          });
        });
      })
      .on('error', (error) => {
        safeReject(error);
      })
      .connect(config);
  });
};

const main = async ({
  host,
  port = 22,
  username,
  auth_type,
  password,
  private_key,
  passphrase,
  command
}: Props): Response => {
  try {
    assertRequiredString(host, 'host');
    assertRequiredString(username, 'username');
    assertRequiredString(command, 'command');

    const authType = auth_type?.trim();
    if (authType !== 'password' && authType !== 'key') {
      throw new Error('auth_type must be password or key');
    }

    const connectionConfig: ConnectConfig = {
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim(),
      readyTimeout: 15000
    };

    if (authType === 'password') {
      assertRequiredString(password, 'password');
      connectionConfig.password = password;
    } else {
      assertRequiredString(private_key, 'private_key');
      connectionConfig.privateKey = private_key;
      if (passphrase?.trim()) {
        connectionConfig.passphrase = passphrase;
      }
    }

    const execResult = await executeCommand(connectionConfig, command);
    const success = execResult.code === 0 && execResult.signal === null;

    return {
      stdout: execResult.stdout,
      stderr:
        execResult.stderr ||
        (success ? '' : `Command exited with code ${execResult.code ?? 'unknown'}`),
      success
    };
  } catch (error) {
    return {
      stdout: '',
      stderr: `SSH command execution failed: ${getErrorText(error)}`,
      success: false
    };
  }
};

export default main;

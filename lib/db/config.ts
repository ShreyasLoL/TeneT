const defaultUserId = '00000000-0000-4000-8000-000000000001';

/** Single-user placeholder until authentication supplies the request user. */
export function getUserId(): string {
  return process.env.TENET_USER_ID || defaultUserId;
}

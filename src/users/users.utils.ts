import bcrypt from 'bcrypt'

export async function hashPassword(passwordToHash: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)

  return bcrypt.hash(passwordToHash, salt)
}

// Exact UTF-8 EIP-191 message format shared by server and browser; API v1.
export function challengeMessage(c) {
  return `${c.domain} wants you to sign in to STRATOKS with your Ethereum account:\n${c.address}\n\nVerify a private visitor account. This signature is free, sends no transaction, and grants no permissions over funds. It does not create resident memories.\n\nURI: ${c.uri}\nVersion: 1\nChain ID: ${c.chainId}\nNonce: ${c.nonce}\nIssued At: ${new Date(c.issuedAt).toISOString()}\nExpiration Time: ${new Date(c.expiresAt).toISOString()}\nOrigin: ${c.origin}\nWorld: ${c.world}`;
}


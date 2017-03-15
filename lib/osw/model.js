/*

Contains model information used only by the wrapper to simplify calling
external services

*/

let model = {};

//
// the encrypt message formats
model.encrypt = {};
model.encrypt.v2 = {};

model.encrypt.v2.jsonldContext = {
  id: '@id',
  type: '@type',
  value: '@value',
  pnp0: 'http://api.webshield.io/prop#',
  pnt0: 'http://api.webshield.io/type#',
  pnp: 'http://pn.schema.webshield.io/prop#',
  pnt: 'http://pn.schema.webshield.io/type#',

  DecryptRequest: 'pnt:DecryptRequest',
  DecryptResponse: 'pnt:DecryptResponse',
  EncryptMetadata: 'pnt:EncryptMetadata',
  EncryptKeyMetadata: 'pnt:EncryptKeyMetadata',
  EncryptRequest: 'pnt:EncryptRequest',
  EncryptResponse: 'pnt:EncryptResponse',
  Metadata: 'pnt0:Metadata',
  KMS: 'pnt:KMS',
  Resource: 'pnt:Resource',

  algorithm: 'pnp:algorithm',
  creation_time: 'pnp0:creation_time',
  content_encrypt_key_md: 'pnp:content_encrypt_key_md',
  content_encrypt_key_md_jwt: 'pnp:content_encrypt_key_md_jwt',
  content_obfuscation_algorithm: 'pnp:content_obfuscation_algorithm',
  description: 'pnp0:description',
  encryption_metadata: 'pnp:encryption_metadata',
  issuer: 'pnp0:issuer',
  os: 'pnp:os',
  obfuscation_provider: 'pnp:obfuscation_provider',
  provider: 'pnp:provider',
  raw_encrypt_key_md: 'pnp:raw_encrypt_key_md',
  raw_encrypt_key_md_type: 'pnp:raw_encrypt_key_md_type',

  aad: 'pnp:aad',
  items: 'pnp:items',
  n: 'pnp:n',
  v: 'pnp:v',
};

module.exports = {
  model: model,
};

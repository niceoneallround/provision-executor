/*

Returns a promise for the result of calling a v1 protocol encrypt
service.

Performs the following
  - converts a privacy algorithm to the format needed to send to the service
  - invokes services
  - passes back result

The V1 Protocol request is of the following format

ENCRYPT REQUEST
{
  '@id': ‘ a request id’,
  '@type': http://pn.schema.webshield.io/type#EncryptRequest,
  'http://pn.schema.webshield.io/prop#encryption_metadata':
  { // the header
    ‘@id’: “http//.../md-1”,
    ‘@type: http://pn.schema.webshield.io/type#EncryptMetadata’,
    ‘http://pn.schema.webshield.io/prop#encrypt_mechanism’:
    'http://id.webshield.io/encypt_mechanism/com/ionic#SHA2_256_OR_AES256’
    ‘http://pn.schema.webshield.io/prop#encrypt_key’: ‘Key_In_Base64_Encoded_Format’
  },
  // There is one item for each field that needs to Encrypted, properties are
  // *id - id for the field, in future will be opaque. This is passed back in the response
  // *type - the encrypt metadata that should be used - indicates what encryption to use and the key to use
  // value - the value to encrypt
  'http://pn.schema.webshield.io/prop#items':
  [
    { ‘id’ : ‘an id', ‘type’: ‘http://.../md-1’, ‘value’ : ‘<clear_text>’ },
    { ‘id’ : ‘an id',   ‘type’: ‘http://..../md-1’, ‘value’ : ‘<clear_text>’ }
  ]
}

*/

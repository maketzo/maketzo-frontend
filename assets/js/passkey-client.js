// passkey-client.js: the browser half of passkeys. Turns the server's JSON
// options into what navigator.credentials wants, and the credential the
// browser returns back into JSON for the server. No library: the conversion
// is base64url both ways and nothing else.
//
// ONE FILE, TWO COPIES, kept identical by a test:
//   maketzo-frontend/assets/js/passkey-client.js  (the login page)
//   maketzo-app/lib/passkey-client.js             (Account > Security)
//
// analytics-exempt: a transport helper, no user-facing surface of its own.
(function (root) {
  'use strict';

  function supported() {
    return !!(root.PublicKeyCredential && root.navigator && root.navigator.credentials && root.navigator.credentials.create);
  }

  // Can this device make a passkey itself (Face ID, Touch ID, Windows Hello,
  // a screen lock)? Resolves false on a desktop with none of those.
  function platformAvailable() {
    if (!supported() || !root.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return Promise.resolve(false);
    return root.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(function () { return false; });
  }

  // Can the browser offer passkeys inside the email field's autofill list?
  function conditionalAvailable() {
    if (!supported() || !root.PublicKeyCredential.isConditionalMediationAvailable) return Promise.resolve(false);
    return root.PublicKeyCredential.isConditionalMediationAvailable().catch(function () { return false; });
  }

  function toBuffer(b64u) {
    var s = String(b64u).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  function fromBuffer(buf) {
    var bytes = new Uint8Array(buf);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function descriptors(list) {
    return (list || []).map(function (c) {
      var d = { type: c.type || 'public-key', id: toBuffer(c.id) };
      if (c.transports) d.transports = c.transports;
      return d;
    });
  }

  function creationOptions(json) {
    if (root.PublicKeyCredential.parseCreationOptionsFromJSON) return root.PublicKeyCredential.parseCreationOptionsFromJSON(json);
    var o = Object.assign({}, json);
    o.challenge = toBuffer(json.challenge);
    o.user = Object.assign({}, json.user, { id: toBuffer(json.user.id) });
    if (json.excludeCredentials) o.excludeCredentials = descriptors(json.excludeCredentials);
    return o;
  }

  function requestOptions(json) {
    if (root.PublicKeyCredential.parseRequestOptionsFromJSON) return root.PublicKeyCredential.parseRequestOptionsFromJSON(json);
    var o = Object.assign({}, json);
    o.challenge = toBuffer(json.challenge);
    if (json.allowCredentials) o.allowCredentials = descriptors(json.allowCredentials);
    return o;
  }

  function credentialJson(cred) {
    if (typeof cred.toJSON === 'function') return cred.toJSON();
    var r = cred.response;
    var out = {
      id: cred.id,
      rawId: fromBuffer(cred.rawId),
      type: cred.type,
      authenticatorAttachment: cred.authenticatorAttachment || undefined,
      clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
      response: { clientDataJSON: fromBuffer(r.clientDataJSON) }
    };
    if (r.attestationObject) {
      out.response.attestationObject = fromBuffer(r.attestationObject);
      if (r.getTransports) out.response.transports = r.getTransports();
    } else {
      out.response.authenticatorData = fromBuffer(r.authenticatorData);
      out.response.signature = fromBuffer(r.signature);
      out.response.userHandle = r.userHandle ? fromBuffer(r.userHandle) : undefined;
    }
    return out;
  }

  // Make a passkey. Resolves to the JSON the server verifies.
  function create(optionsJson) {
    return root.navigator.credentials.create({ publicKey: creationOptions(optionsJson) }).then(credentialJson);
  }

  // Sign in with one. `extra` may carry { mediation: 'conditional', signal }
  // for the autofill flow.
  function get(optionsJson, extra) {
    var req = Object.assign({ publicKey: requestOptions(optionsJson) }, extra || {});
    return root.navigator.credentials.get(req).then(credentialJson);
  }

  // Plain words for the errors the browser throws, in the trader's terms.
  function explain(err, adding) {
    var name = err && err.name;
    if (name === 'NotAllowedError' || name === 'AbortError') return adding ? 'That was cancelled. Try again when you are ready.' : 'That was cancelled. Try again, or sign in another way.';
    if (name === 'InvalidStateError') return 'This device already has a passkey for your account.';
    if (name === 'NotSupportedError') return 'This device cannot make passkeys. Try Chrome, Safari or Edge on a device with a screen lock.';
    if (name === 'SecurityError') return 'Passkeys only work on the MAKETZO site itself. Open maketzo.co and try again.';
    return adding ? 'Could not add a passkey on this device.' : 'Could not sign in with a passkey on this device.';
  }

  root.MaketzoPasskeyClient = {
    supported: supported,
    platformAvailable: platformAvailable,
    conditionalAvailable: conditionalAvailable,
    create: create,
    get: get,
    explain: explain,
    _internals: { toBuffer: toBuffer, fromBuffer: fromBuffer, creationOptions: creationOptions, requestOptions: requestOptions, credentialJson: credentialJson }
  };
})(typeof window !== 'undefined' ? window : this);

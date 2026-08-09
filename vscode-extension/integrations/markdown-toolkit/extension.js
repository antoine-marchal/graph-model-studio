"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// node_modules/.pnpm/mdurl@2.0.0/node_modules/mdurl/build/index.cjs.js
var require_index_cjs = __commonJS({
  "node_modules/.pnpm/mdurl@2.0.0/node_modules/mdurl/build/index.cjs.js"(exports2) {
    "use strict";
    var decodeCache = {};
    function getDecodeCache(exclude) {
      let cache = decodeCache[exclude];
      if (cache) {
        return cache;
      }
      cache = decodeCache[exclude] = [];
      for (let i = 0; i < 128; i++) {
        const ch = String.fromCharCode(i);
        cache.push(ch);
      }
      for (let i = 0; i < exclude.length; i++) {
        const ch = exclude.charCodeAt(i);
        cache[ch] = "%" + ("0" + ch.toString(16).toUpperCase()).slice(-2);
      }
      return cache;
    }
    function decode(string, exclude) {
      if (typeof exclude !== "string") {
        exclude = decode.defaultChars;
      }
      const cache = getDecodeCache(exclude);
      return string.replace(/(%[a-f0-9]{2})+/gi, function(seq) {
        let result = "";
        for (let i = 0, l = seq.length; i < l; i += 3) {
          const b1 = parseInt(seq.slice(i + 1, i + 3), 16);
          if (b1 < 128) {
            result += cache[b1];
            continue;
          }
          if ((b1 & 224) === 192 && i + 3 < l) {
            const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
            if ((b2 & 192) === 128) {
              const chr = b1 << 6 & 1984 | b2 & 63;
              if (chr < 128) {
                result += "\uFFFD\uFFFD";
              } else {
                result += String.fromCharCode(chr);
              }
              i += 3;
              continue;
            }
          }
          if ((b1 & 240) === 224 && i + 6 < l) {
            const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
            const b3 = parseInt(seq.slice(i + 7, i + 9), 16);
            if ((b2 & 192) === 128 && (b3 & 192) === 128) {
              const chr = b1 << 12 & 61440 | b2 << 6 & 4032 | b3 & 63;
              if (chr < 2048 || chr >= 55296 && chr <= 57343) {
                result += "\uFFFD\uFFFD\uFFFD";
              } else {
                result += String.fromCharCode(chr);
              }
              i += 6;
              continue;
            }
          }
          if ((b1 & 248) === 240 && i + 9 < l) {
            const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
            const b3 = parseInt(seq.slice(i + 7, i + 9), 16);
            const b4 = parseInt(seq.slice(i + 10, i + 12), 16);
            if ((b2 & 192) === 128 && (b3 & 192) === 128 && (b4 & 192) === 128) {
              let chr = b1 << 18 & 1835008 | b2 << 12 & 258048 | b3 << 6 & 4032 | b4 & 63;
              if (chr < 65536 || chr > 1114111) {
                result += "\uFFFD\uFFFD\uFFFD\uFFFD";
              } else {
                chr -= 65536;
                result += String.fromCharCode(55296 + (chr >> 10), 56320 + (chr & 1023));
              }
              i += 9;
              continue;
            }
          }
          result += "\uFFFD";
        }
        return result;
      });
    }
    decode.defaultChars = ";/?:@&=+$,#";
    decode.componentChars = "";
    var encodeCache = {};
    function getEncodeCache(exclude) {
      let cache = encodeCache[exclude];
      if (cache) {
        return cache;
      }
      cache = encodeCache[exclude] = [];
      for (let i = 0; i < 128; i++) {
        const ch = String.fromCharCode(i);
        if (/^[0-9a-z]$/i.test(ch)) {
          cache.push(ch);
        } else {
          cache.push("%" + ("0" + i.toString(16).toUpperCase()).slice(-2));
        }
      }
      for (let i = 0; i < exclude.length; i++) {
        cache[exclude.charCodeAt(i)] = exclude[i];
      }
      return cache;
    }
    function encode(string, exclude, keepEscaped) {
      if (typeof exclude !== "string") {
        keepEscaped = exclude;
        exclude = encode.defaultChars;
      }
      if (typeof keepEscaped === "undefined") {
        keepEscaped = true;
      }
      const cache = getEncodeCache(exclude);
      let result = "";
      for (let i = 0, l = string.length; i < l; i++) {
        const code = string.charCodeAt(i);
        if (keepEscaped && code === 37 && i + 2 < l) {
          if (/^[0-9a-f]{2}$/i.test(string.slice(i + 1, i + 3))) {
            result += string.slice(i, i + 3);
            i += 2;
            continue;
          }
        }
        if (code < 128) {
          result += cache[code];
          continue;
        }
        if (code >= 55296 && code <= 57343) {
          if (code >= 55296 && code <= 56319 && i + 1 < l) {
            const nextCode = string.charCodeAt(i + 1);
            if (nextCode >= 56320 && nextCode <= 57343) {
              result += encodeURIComponent(string[i] + string[i + 1]);
              i++;
              continue;
            }
          }
          result += "%EF%BF%BD";
          continue;
        }
        result += encodeURIComponent(string[i]);
      }
      return result;
    }
    encode.defaultChars = ";/?:@&=+$,-_.!~*'()#";
    encode.componentChars = "-_.!~*'()";
    function format(url) {
      let result = "";
      result += url.protocol || "";
      result += url.slashes ? "//" : "";
      result += url.auth ? url.auth + "@" : "";
      if (url.hostname && url.hostname.indexOf(":") !== -1) {
        result += "[" + url.hostname + "]";
      } else {
        result += url.hostname || "";
      }
      result += url.port ? ":" + url.port : "";
      result += url.pathname || "";
      result += url.search || "";
      result += url.hash || "";
      return result;
    }
    function Url() {
      this.protocol = null;
      this.slashes = null;
      this.auth = null;
      this.port = null;
      this.hostname = null;
      this.hash = null;
      this.search = null;
      this.pathname = null;
    }
    var protocolPattern = /^([a-z0-9.+-]+:)/i;
    var portPattern = /:[0-9]*$/;
    var simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/;
    var delims = ["<", ">", '"', "`", " ", "\r", "\n", "	"];
    var unwise = ["{", "}", "|", "\\", "^", "`"].concat(delims);
    var autoEscape = ["'"].concat(unwise);
    var nonHostChars = ["%", "/", "?", ";", "#"].concat(autoEscape);
    var hostEndingChars = ["/", "?", "#"];
    var hostnameMaxLen = 255;
    var hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/;
    var hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/;
    var hostlessProtocol = {
      javascript: true,
      "javascript:": true
    };
    var slashedProtocol = {
      http: true,
      https: true,
      ftp: true,
      gopher: true,
      file: true,
      "http:": true,
      "https:": true,
      "ftp:": true,
      "gopher:": true,
      "file:": true
    };
    function urlParse(url, slashesDenoteHost) {
      if (url && url instanceof Url) return url;
      const u = new Url();
      u.parse(url, slashesDenoteHost);
      return u;
    }
    Url.prototype.parse = function(url, slashesDenoteHost) {
      let lowerProto, hec, slashes;
      let rest = url;
      rest = rest.trim();
      if (!slashesDenoteHost && url.split("#").length === 1) {
        const simplePath = simplePathPattern.exec(rest);
        if (simplePath) {
          this.pathname = simplePath[1];
          if (simplePath[2]) {
            this.search = simplePath[2];
          }
          return this;
        }
      }
      let proto = protocolPattern.exec(rest);
      if (proto) {
        proto = proto[0];
        lowerProto = proto.toLowerCase();
        this.protocol = proto;
        rest = rest.substr(proto.length);
      }
      if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
        slashes = rest.substr(0, 2) === "//";
        if (slashes && !(proto && hostlessProtocol[proto])) {
          rest = rest.substr(2);
          this.slashes = true;
        }
      }
      if (!hostlessProtocol[proto] && (slashes || proto && !slashedProtocol[proto])) {
        let hostEnd = -1;
        for (let i = 0; i < hostEndingChars.length; i++) {
          hec = rest.indexOf(hostEndingChars[i]);
          if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
            hostEnd = hec;
          }
        }
        let auth, atSign;
        if (hostEnd === -1) {
          atSign = rest.lastIndexOf("@");
        } else {
          atSign = rest.lastIndexOf("@", hostEnd);
        }
        if (atSign !== -1) {
          auth = rest.slice(0, atSign);
          rest = rest.slice(atSign + 1);
          this.auth = auth;
        }
        hostEnd = -1;
        for (let i = 0; i < nonHostChars.length; i++) {
          hec = rest.indexOf(nonHostChars[i]);
          if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
            hostEnd = hec;
          }
        }
        if (hostEnd === -1) {
          hostEnd = rest.length;
        }
        if (rest[hostEnd - 1] === ":") {
          hostEnd--;
        }
        const host = rest.slice(0, hostEnd);
        rest = rest.slice(hostEnd);
        this.parseHost(host);
        this.hostname = this.hostname || "";
        const ipv6Hostname = this.hostname[0] === "[" && this.hostname[this.hostname.length - 1] === "]";
        if (!ipv6Hostname) {
          const hostparts = this.hostname.split(/\./);
          for (let i = 0, l = hostparts.length; i < l; i++) {
            const part = hostparts[i];
            if (!part) {
              continue;
            }
            if (!part.match(hostnamePartPattern)) {
              let newpart = "";
              for (let j = 0, k = part.length; j < k; j++) {
                if (part.charCodeAt(j) > 127) {
                  newpart += "x";
                } else {
                  newpart += part[j];
                }
              }
              if (!newpart.match(hostnamePartPattern)) {
                const validParts = hostparts.slice(0, i);
                const notHost = hostparts.slice(i + 1);
                const bit = part.match(hostnamePartStart);
                if (bit) {
                  validParts.push(bit[1]);
                  notHost.unshift(bit[2]);
                }
                if (notHost.length) {
                  rest = notHost.join(".") + rest;
                }
                this.hostname = validParts.join(".");
                break;
              }
            }
          }
        }
        if (this.hostname.length > hostnameMaxLen) {
          this.hostname = "";
        }
        if (ipv6Hostname) {
          this.hostname = this.hostname.substr(1, this.hostname.length - 2);
        }
      }
      const hash = rest.indexOf("#");
      if (hash !== -1) {
        this.hash = rest.substr(hash);
        rest = rest.slice(0, hash);
      }
      const qm = rest.indexOf("?");
      if (qm !== -1) {
        this.search = rest.substr(qm);
        rest = rest.slice(0, qm);
      }
      if (rest) {
        this.pathname = rest;
      }
      if (slashedProtocol[lowerProto] && this.hostname && !this.pathname) {
        this.pathname = "";
      }
      return this;
    };
    Url.prototype.parseHost = function(host) {
      let port = portPattern.exec(host);
      if (port) {
        port = port[0];
        if (port !== ":") {
          this.port = port.substr(1);
        }
        host = host.substr(0, host.length - port.length);
      }
      if (host) {
        this.hostname = host;
      }
    };
    exports2.decode = decode;
    exports2.encode = encode;
    exports2.format = format;
    exports2.parse = urlParse;
  }
});

// node_modules/.pnpm/uc.micro@2.1.0/node_modules/uc.micro/build/index.cjs.js
var require_index_cjs2 = __commonJS({
  "node_modules/.pnpm/uc.micro@2.1.0/node_modules/uc.micro/build/index.cjs.js"(exports2) {
    "use strict";
    var regex$5 = /[\0-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
    var regex$4 = /[\0-\x1F\x7F-\x9F]/;
    var regex$3 = /[\xAD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]|\uD804[\uDCBD\uDCCD]|\uD80D[\uDC30-\uDC3F]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01\uDC20-\uDC7F]/;
    var regex$2 = /[!-#%-\*,-\/:;\?@\[-\]_\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061D-\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0A76\u0AF0\u0C77\u0C84\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1B7D\u1B7E\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E4F\u2E52-\u2E5D\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]|\uD800[\uDD00-\uDD02\uDF9F\uDFD0]|\uD801\uDD6F|\uD802[\uDC57\uDD1F\uDD3F\uDE50-\uDE58\uDE7F\uDEF0-\uDEF6\uDF39-\uDF3F\uDF99-\uDF9C]|\uD803[\uDEAD\uDF55-\uDF59\uDF86-\uDF89]|\uD804[\uDC47-\uDC4D\uDCBB\uDCBC\uDCBE-\uDCC1\uDD40-\uDD43\uDD74\uDD75\uDDC5-\uDDC8\uDDCD\uDDDB\uDDDD-\uDDDF\uDE38-\uDE3D\uDEA9]|\uD805[\uDC4B-\uDC4F\uDC5A\uDC5B\uDC5D\uDCC6\uDDC1-\uDDD7\uDE41-\uDE43\uDE60-\uDE6C\uDEB9\uDF3C-\uDF3E]|\uD806[\uDC3B\uDD44-\uDD46\uDDE2\uDE3F-\uDE46\uDE9A-\uDE9C\uDE9E-\uDEA2\uDF00-\uDF09]|\uD807[\uDC41-\uDC45\uDC70\uDC71\uDEF7\uDEF8\uDF43-\uDF4F\uDFFF]|\uD809[\uDC70-\uDC74]|\uD80B[\uDFF1\uDFF2]|\uD81A[\uDE6E\uDE6F\uDEF5\uDF37-\uDF3B\uDF44]|\uD81B[\uDE97-\uDE9A\uDFE2]|\uD82F\uDC9F|\uD836[\uDE87-\uDE8B]|\uD83A[\uDD5E\uDD5F]/;
    var regex$1 = /[\$\+<->\^`\|~\xA2-\xA6\xA8\xA9\xAC\xAE-\xB1\xB4\xB8\xD7\xF7\u02C2-\u02C5\u02D2-\u02DF\u02E5-\u02EB\u02ED\u02EF-\u02FF\u0375\u0384\u0385\u03F6\u0482\u058D-\u058F\u0606-\u0608\u060B\u060E\u060F\u06DE\u06E9\u06FD\u06FE\u07F6\u07FE\u07FF\u0888\u09F2\u09F3\u09FA\u09FB\u0AF1\u0B70\u0BF3-\u0BFA\u0C7F\u0D4F\u0D79\u0E3F\u0F01-\u0F03\u0F13\u0F15-\u0F17\u0F1A-\u0F1F\u0F34\u0F36\u0F38\u0FBE-\u0FC5\u0FC7-\u0FCC\u0FCE\u0FCF\u0FD5-\u0FD8\u109E\u109F\u1390-\u1399\u166D\u17DB\u1940\u19DE-\u19FF\u1B61-\u1B6A\u1B74-\u1B7C\u1FBD\u1FBF-\u1FC1\u1FCD-\u1FCF\u1FDD-\u1FDF\u1FED-\u1FEF\u1FFD\u1FFE\u2044\u2052\u207A-\u207C\u208A-\u208C\u20A0-\u20C0\u2100\u2101\u2103-\u2106\u2108\u2109\u2114\u2116-\u2118\u211E-\u2123\u2125\u2127\u2129\u212E\u213A\u213B\u2140-\u2144\u214A-\u214D\u214F\u218A\u218B\u2190-\u2307\u230C-\u2328\u232B-\u2426\u2440-\u244A\u249C-\u24E9\u2500-\u2767\u2794-\u27C4\u27C7-\u27E5\u27F0-\u2982\u2999-\u29D7\u29DC-\u29FB\u29FE-\u2B73\u2B76-\u2B95\u2B97-\u2BFF\u2CE5-\u2CEA\u2E50\u2E51\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u2FF0-\u2FFF\u3004\u3012\u3013\u3020\u3036\u3037\u303E\u303F\u309B\u309C\u3190\u3191\u3196-\u319F\u31C0-\u31E3\u31EF\u3200-\u321E\u322A-\u3247\u3250\u3260-\u327F\u328A-\u32B0\u32C0-\u33FF\u4DC0-\u4DFF\uA490-\uA4C6\uA700-\uA716\uA720\uA721\uA789\uA78A\uA828-\uA82B\uA836-\uA839\uAA77-\uAA79\uAB5B\uAB6A\uAB6B\uFB29\uFBB2-\uFBC2\uFD40-\uFD4F\uFDCF\uFDFC-\uFDFF\uFE62\uFE64-\uFE66\uFE69\uFF04\uFF0B\uFF1C-\uFF1E\uFF3E\uFF40\uFF5C\uFF5E\uFFE0-\uFFE6\uFFE8-\uFFEE\uFFFC\uFFFD]|\uD800[\uDD37-\uDD3F\uDD79-\uDD89\uDD8C-\uDD8E\uDD90-\uDD9C\uDDA0\uDDD0-\uDDFC]|\uD802[\uDC77\uDC78\uDEC8]|\uD805\uDF3F|\uD807[\uDFD5-\uDFF1]|\uD81A[\uDF3C-\uDF3F\uDF45]|\uD82F\uDC9C|\uD833[\uDF50-\uDFC3]|\uD834[\uDC00-\uDCF5\uDD00-\uDD26\uDD29-\uDD64\uDD6A-\uDD6C\uDD83\uDD84\uDD8C-\uDDA9\uDDAE-\uDDEA\uDE00-\uDE41\uDE45\uDF00-\uDF56]|\uD835[\uDEC1\uDEDB\uDEFB\uDF15\uDF35\uDF4F\uDF6F\uDF89\uDFA9\uDFC3]|\uD836[\uDC00-\uDDFF\uDE37-\uDE3A\uDE6D-\uDE74\uDE76-\uDE83\uDE85\uDE86]|\uD838[\uDD4F\uDEFF]|\uD83B[\uDCAC\uDCB0\uDD2E\uDEF0\uDEF1]|\uD83C[\uDC00-\uDC2B\uDC30-\uDC93\uDCA0-\uDCAE\uDCB1-\uDCBF\uDCC1-\uDCCF\uDCD1-\uDCF5\uDD0D-\uDDAD\uDDE6-\uDE02\uDE10-\uDE3B\uDE40-\uDE48\uDE50\uDE51\uDE60-\uDE65\uDF00-\uDFFF]|\uD83D[\uDC00-\uDED7\uDEDC-\uDEEC\uDEF0-\uDEFC\uDF00-\uDF76\uDF7B-\uDFD9\uDFE0-\uDFEB\uDFF0]|\uD83E[\uDC00-\uDC0B\uDC10-\uDC47\uDC50-\uDC59\uDC60-\uDC87\uDC90-\uDCAD\uDCB0\uDCB1\uDD00-\uDE53\uDE60-\uDE6D\uDE70-\uDE7C\uDE80-\uDE88\uDE90-\uDEBD\uDEBF-\uDEC5\uDECE-\uDEDB\uDEE0-\uDEE8\uDEF0-\uDEF8\uDF00-\uDF92\uDF94-\uDFCA]/;
    var regex = /[ \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;
    exports2.Any = regex$5;
    exports2.Cc = regex$4;
    exports2.Cf = regex$3;
    exports2.P = regex$2;
    exports2.S = regex$1;
    exports2.Z = regex;
  }
});

// node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/generated/decode-data-html.js
var require_decode_data_html = __commonJS({
  "node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/generated/decode-data-html.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = new Uint16Array(
      // prettier-ignore
      '\u1D41<\xD5\u0131\u028A\u049D\u057B\u05D0\u0675\u06DE\u07A2\u07D6\u080F\u0A4A\u0A91\u0DA1\u0E6D\u0F09\u0F26\u10CA\u1228\u12E1\u1415\u149D\u14C3\u14DF\u1525\0\0\0\0\0\0\u156B\u16CD\u198D\u1C12\u1DDD\u1F7E\u2060\u21B0\u228D\u23C0\u23FB\u2442\u2824\u2912\u2D08\u2E48\u2FCE\u3016\u32BA\u3639\u37AC\u38FE\u3A28\u3A71\u3AE0\u3B2E\u0800EMabcfglmnoprstu\\bfms\x7F\x84\x8B\x90\x95\x98\xA6\xB3\xB9\xC8\xCFlig\u803B\xC6\u40C6P\u803B&\u4026cute\u803B\xC1\u40C1reve;\u4102\u0100iyx}rc\u803B\xC2\u40C2;\u4410r;\uC000\u{1D504}rave\u803B\xC0\u40C0pha;\u4391acr;\u4100d;\u6A53\u0100gp\x9D\xA1on;\u4104f;\uC000\u{1D538}plyFunction;\u6061ing\u803B\xC5\u40C5\u0100cs\xBE\xC3r;\uC000\u{1D49C}ign;\u6254ilde\u803B\xC3\u40C3ml\u803B\xC4\u40C4\u0400aceforsu\xE5\xFB\xFE\u0117\u011C\u0122\u0127\u012A\u0100cr\xEA\xF2kslash;\u6216\u0176\xF6\xF8;\u6AE7ed;\u6306y;\u4411\u0180crt\u0105\u010B\u0114ause;\u6235noullis;\u612Ca;\u4392r;\uC000\u{1D505}pf;\uC000\u{1D539}eve;\u42D8c\xF2\u0113mpeq;\u624E\u0700HOacdefhilorsu\u014D\u0151\u0156\u0180\u019E\u01A2\u01B5\u01B7\u01BA\u01DC\u0215\u0273\u0278\u027Ecy;\u4427PY\u803B\xA9\u40A9\u0180cpy\u015D\u0162\u017Aute;\u4106\u0100;i\u0167\u0168\u62D2talDifferentialD;\u6145leys;\u612D\u0200aeio\u0189\u018E\u0194\u0198ron;\u410Cdil\u803B\xC7\u40C7rc;\u4108nint;\u6230ot;\u410A\u0100dn\u01A7\u01ADilla;\u40B8terDot;\u40B7\xF2\u017Fi;\u43A7rcle\u0200DMPT\u01C7\u01CB\u01D1\u01D6ot;\u6299inus;\u6296lus;\u6295imes;\u6297o\u0100cs\u01E2\u01F8kwiseContourIntegral;\u6232eCurly\u0100DQ\u0203\u020FoubleQuote;\u601Duote;\u6019\u0200lnpu\u021E\u0228\u0247\u0255on\u0100;e\u0225\u0226\u6237;\u6A74\u0180git\u022F\u0236\u023Aruent;\u6261nt;\u622FourIntegral;\u622E\u0100fr\u024C\u024E;\u6102oduct;\u6210nterClockwiseContourIntegral;\u6233oss;\u6A2Fcr;\uC000\u{1D49E}p\u0100;C\u0284\u0285\u62D3ap;\u624D\u0580DJSZacefios\u02A0\u02AC\u02B0\u02B4\u02B8\u02CB\u02D7\u02E1\u02E6\u0333\u048D\u0100;o\u0179\u02A5trahd;\u6911cy;\u4402cy;\u4405cy;\u440F\u0180grs\u02BF\u02C4\u02C7ger;\u6021r;\u61A1hv;\u6AE4\u0100ay\u02D0\u02D5ron;\u410E;\u4414l\u0100;t\u02DD\u02DE\u6207a;\u4394r;\uC000\u{1D507}\u0100af\u02EB\u0327\u0100cm\u02F0\u0322ritical\u0200ADGT\u0300\u0306\u0316\u031Ccute;\u40B4o\u0174\u030B\u030D;\u42D9bleAcute;\u42DDrave;\u4060ilde;\u42DCond;\u62C4ferentialD;\u6146\u0470\u033D\0\0\0\u0342\u0354\0\u0405f;\uC000\u{1D53B}\u0180;DE\u0348\u0349\u034D\u40A8ot;\u60DCqual;\u6250ble\u0300CDLRUV\u0363\u0372\u0382\u03CF\u03E2\u03F8ontourIntegra\xEC\u0239o\u0274\u0379\0\0\u037B\xBB\u0349nArrow;\u61D3\u0100eo\u0387\u03A4ft\u0180ART\u0390\u0396\u03A1rrow;\u61D0ightArrow;\u61D4e\xE5\u02CAng\u0100LR\u03AB\u03C4eft\u0100AR\u03B3\u03B9rrow;\u67F8ightArrow;\u67FAightArrow;\u67F9ight\u0100AT\u03D8\u03DErrow;\u61D2ee;\u62A8p\u0241\u03E9\0\0\u03EFrrow;\u61D1ownArrow;\u61D5erticalBar;\u6225n\u0300ABLRTa\u0412\u042A\u0430\u045E\u047F\u037Crrow\u0180;BU\u041D\u041E\u0422\u6193ar;\u6913pArrow;\u61F5reve;\u4311eft\u02D2\u043A\0\u0446\0\u0450ightVector;\u6950eeVector;\u695Eector\u0100;B\u0459\u045A\u61BDar;\u6956ight\u01D4\u0467\0\u0471eeVector;\u695Fector\u0100;B\u047A\u047B\u61C1ar;\u6957ee\u0100;A\u0486\u0487\u62A4rrow;\u61A7\u0100ct\u0492\u0497r;\uC000\u{1D49F}rok;\u4110\u0800NTacdfglmopqstux\u04BD\u04C0\u04C4\u04CB\u04DE\u04E2\u04E7\u04EE\u04F5\u0521\u052F\u0536\u0552\u055D\u0560\u0565G;\u414AH\u803B\xD0\u40D0cute\u803B\xC9\u40C9\u0180aiy\u04D2\u04D7\u04DCron;\u411Arc\u803B\xCA\u40CA;\u442Dot;\u4116r;\uC000\u{1D508}rave\u803B\xC8\u40C8ement;\u6208\u0100ap\u04FA\u04FEcr;\u4112ty\u0253\u0506\0\0\u0512mallSquare;\u65FBerySmallSquare;\u65AB\u0100gp\u0526\u052Aon;\u4118f;\uC000\u{1D53C}silon;\u4395u\u0100ai\u053C\u0549l\u0100;T\u0542\u0543\u6A75ilde;\u6242librium;\u61CC\u0100ci\u0557\u055Ar;\u6130m;\u6A73a;\u4397ml\u803B\xCB\u40CB\u0100ip\u056A\u056Fsts;\u6203onentialE;\u6147\u0280cfios\u0585\u0588\u058D\u05B2\u05CCy;\u4424r;\uC000\u{1D509}lled\u0253\u0597\0\0\u05A3mallSquare;\u65FCerySmallSquare;\u65AA\u0370\u05BA\0\u05BF\0\0\u05C4f;\uC000\u{1D53D}All;\u6200riertrf;\u6131c\xF2\u05CB\u0600JTabcdfgorst\u05E8\u05EC\u05EF\u05FA\u0600\u0612\u0616\u061B\u061D\u0623\u066C\u0672cy;\u4403\u803B>\u403Emma\u0100;d\u05F7\u05F8\u4393;\u43DCreve;\u411E\u0180eiy\u0607\u060C\u0610dil;\u4122rc;\u411C;\u4413ot;\u4120r;\uC000\u{1D50A};\u62D9pf;\uC000\u{1D53E}eater\u0300EFGLST\u0635\u0644\u064E\u0656\u065B\u0666qual\u0100;L\u063E\u063F\u6265ess;\u62DBullEqual;\u6267reater;\u6AA2ess;\u6277lantEqual;\u6A7Eilde;\u6273cr;\uC000\u{1D4A2};\u626B\u0400Aacfiosu\u0685\u068B\u0696\u069B\u069E\u06AA\u06BE\u06CARDcy;\u442A\u0100ct\u0690\u0694ek;\u42C7;\u405Eirc;\u4124r;\u610ClbertSpace;\u610B\u01F0\u06AF\0\u06B2f;\u610DizontalLine;\u6500\u0100ct\u06C3\u06C5\xF2\u06A9rok;\u4126mp\u0144\u06D0\u06D8ownHum\xF0\u012Fqual;\u624F\u0700EJOacdfgmnostu\u06FA\u06FE\u0703\u0707\u070E\u071A\u071E\u0721\u0728\u0744\u0778\u078B\u078F\u0795cy;\u4415lig;\u4132cy;\u4401cute\u803B\xCD\u40CD\u0100iy\u0713\u0718rc\u803B\xCE\u40CE;\u4418ot;\u4130r;\u6111rave\u803B\xCC\u40CC\u0180;ap\u0720\u072F\u073F\u0100cg\u0734\u0737r;\u412AinaryI;\u6148lie\xF3\u03DD\u01F4\u0749\0\u0762\u0100;e\u074D\u074E\u622C\u0100gr\u0753\u0758ral;\u622Bsection;\u62C2isible\u0100CT\u076C\u0772omma;\u6063imes;\u6062\u0180gpt\u077F\u0783\u0788on;\u412Ef;\uC000\u{1D540}a;\u4399cr;\u6110ilde;\u4128\u01EB\u079A\0\u079Ecy;\u4406l\u803B\xCF\u40CF\u0280cfosu\u07AC\u07B7\u07BC\u07C2\u07D0\u0100iy\u07B1\u07B5rc;\u4134;\u4419r;\uC000\u{1D50D}pf;\uC000\u{1D541}\u01E3\u07C7\0\u07CCr;\uC000\u{1D4A5}rcy;\u4408kcy;\u4404\u0380HJacfos\u07E4\u07E8\u07EC\u07F1\u07FD\u0802\u0808cy;\u4425cy;\u440Cppa;\u439A\u0100ey\u07F6\u07FBdil;\u4136;\u441Ar;\uC000\u{1D50E}pf;\uC000\u{1D542}cr;\uC000\u{1D4A6}\u0580JTaceflmost\u0825\u0829\u082C\u0850\u0863\u09B3\u09B8\u09C7\u09CD\u0A37\u0A47cy;\u4409\u803B<\u403C\u0280cmnpr\u0837\u083C\u0841\u0844\u084Dute;\u4139bda;\u439Bg;\u67EAlacetrf;\u6112r;\u619E\u0180aey\u0857\u085C\u0861ron;\u413Ddil;\u413B;\u441B\u0100fs\u0868\u0970t\u0500ACDFRTUVar\u087E\u08A9\u08B1\u08E0\u08E6\u08FC\u092F\u095B\u0390\u096A\u0100nr\u0883\u088FgleBracket;\u67E8row\u0180;BR\u0899\u089A\u089E\u6190ar;\u61E4ightArrow;\u61C6eiling;\u6308o\u01F5\u08B7\0\u08C3bleBracket;\u67E6n\u01D4\u08C8\0\u08D2eeVector;\u6961ector\u0100;B\u08DB\u08DC\u61C3ar;\u6959loor;\u630Aight\u0100AV\u08EF\u08F5rrow;\u6194ector;\u694E\u0100er\u0901\u0917e\u0180;AV\u0909\u090A\u0910\u62A3rrow;\u61A4ector;\u695Aiangle\u0180;BE\u0924\u0925\u0929\u62B2ar;\u69CFqual;\u62B4p\u0180DTV\u0937\u0942\u094CownVector;\u6951eeVector;\u6960ector\u0100;B\u0956\u0957\u61BFar;\u6958ector\u0100;B\u0965\u0966\u61BCar;\u6952ight\xE1\u039Cs\u0300EFGLST\u097E\u098B\u0995\u099D\u09A2\u09ADqualGreater;\u62DAullEqual;\u6266reater;\u6276ess;\u6AA1lantEqual;\u6A7Dilde;\u6272r;\uC000\u{1D50F}\u0100;e\u09BD\u09BE\u62D8ftarrow;\u61DAidot;\u413F\u0180npw\u09D4\u0A16\u0A1Bg\u0200LRlr\u09DE\u09F7\u0A02\u0A10eft\u0100AR\u09E6\u09ECrrow;\u67F5ightArrow;\u67F7ightArrow;\u67F6eft\u0100ar\u03B3\u0A0Aight\xE1\u03BFight\xE1\u03CAf;\uC000\u{1D543}er\u0100LR\u0A22\u0A2CeftArrow;\u6199ightArrow;\u6198\u0180cht\u0A3E\u0A40\u0A42\xF2\u084C;\u61B0rok;\u4141;\u626A\u0400acefiosu\u0A5A\u0A5D\u0A60\u0A77\u0A7C\u0A85\u0A8B\u0A8Ep;\u6905y;\u441C\u0100dl\u0A65\u0A6FiumSpace;\u605Flintrf;\u6133r;\uC000\u{1D510}nusPlus;\u6213pf;\uC000\u{1D544}c\xF2\u0A76;\u439C\u0480Jacefostu\u0AA3\u0AA7\u0AAD\u0AC0\u0B14\u0B19\u0D91\u0D97\u0D9Ecy;\u440Acute;\u4143\u0180aey\u0AB4\u0AB9\u0ABEron;\u4147dil;\u4145;\u441D\u0180gsw\u0AC7\u0AF0\u0B0Eative\u0180MTV\u0AD3\u0ADF\u0AE8ediumSpace;\u600Bhi\u0100cn\u0AE6\u0AD8\xEB\u0AD9eryThi\xEE\u0AD9ted\u0100GL\u0AF8\u0B06reaterGreate\xF2\u0673essLes\xF3\u0A48Line;\u400Ar;\uC000\u{1D511}\u0200Bnpt\u0B22\u0B28\u0B37\u0B3Areak;\u6060BreakingSpace;\u40A0f;\u6115\u0680;CDEGHLNPRSTV\u0B55\u0B56\u0B6A\u0B7C\u0BA1\u0BEB\u0C04\u0C5E\u0C84\u0CA6\u0CD8\u0D61\u0D85\u6AEC\u0100ou\u0B5B\u0B64ngruent;\u6262pCap;\u626DoubleVerticalBar;\u6226\u0180lqx\u0B83\u0B8A\u0B9Bement;\u6209ual\u0100;T\u0B92\u0B93\u6260ilde;\uC000\u2242\u0338ists;\u6204reater\u0380;EFGLST\u0BB6\u0BB7\u0BBD\u0BC9\u0BD3\u0BD8\u0BE5\u626Fqual;\u6271ullEqual;\uC000\u2267\u0338reater;\uC000\u226B\u0338ess;\u6279lantEqual;\uC000\u2A7E\u0338ilde;\u6275ump\u0144\u0BF2\u0BFDownHump;\uC000\u224E\u0338qual;\uC000\u224F\u0338e\u0100fs\u0C0A\u0C27tTriangle\u0180;BE\u0C1A\u0C1B\u0C21\u62EAar;\uC000\u29CF\u0338qual;\u62ECs\u0300;EGLST\u0C35\u0C36\u0C3C\u0C44\u0C4B\u0C58\u626Equal;\u6270reater;\u6278ess;\uC000\u226A\u0338lantEqual;\uC000\u2A7D\u0338ilde;\u6274ested\u0100GL\u0C68\u0C79reaterGreater;\uC000\u2AA2\u0338essLess;\uC000\u2AA1\u0338recedes\u0180;ES\u0C92\u0C93\u0C9B\u6280qual;\uC000\u2AAF\u0338lantEqual;\u62E0\u0100ei\u0CAB\u0CB9verseElement;\u620CghtTriangle\u0180;BE\u0CCB\u0CCC\u0CD2\u62EBar;\uC000\u29D0\u0338qual;\u62ED\u0100qu\u0CDD\u0D0CuareSu\u0100bp\u0CE8\u0CF9set\u0100;E\u0CF0\u0CF3\uC000\u228F\u0338qual;\u62E2erset\u0100;E\u0D03\u0D06\uC000\u2290\u0338qual;\u62E3\u0180bcp\u0D13\u0D24\u0D4Eset\u0100;E\u0D1B\u0D1E\uC000\u2282\u20D2qual;\u6288ceeds\u0200;EST\u0D32\u0D33\u0D3B\u0D46\u6281qual;\uC000\u2AB0\u0338lantEqual;\u62E1ilde;\uC000\u227F\u0338erset\u0100;E\u0D58\u0D5B\uC000\u2283\u20D2qual;\u6289ilde\u0200;EFT\u0D6E\u0D6F\u0D75\u0D7F\u6241qual;\u6244ullEqual;\u6247ilde;\u6249erticalBar;\u6224cr;\uC000\u{1D4A9}ilde\u803B\xD1\u40D1;\u439D\u0700Eacdfgmoprstuv\u0DBD\u0DC2\u0DC9\u0DD5\u0DDB\u0DE0\u0DE7\u0DFC\u0E02\u0E20\u0E22\u0E32\u0E3F\u0E44lig;\u4152cute\u803B\xD3\u40D3\u0100iy\u0DCE\u0DD3rc\u803B\xD4\u40D4;\u441Eblac;\u4150r;\uC000\u{1D512}rave\u803B\xD2\u40D2\u0180aei\u0DEE\u0DF2\u0DF6cr;\u414Cga;\u43A9cron;\u439Fpf;\uC000\u{1D546}enCurly\u0100DQ\u0E0E\u0E1AoubleQuote;\u601Cuote;\u6018;\u6A54\u0100cl\u0E27\u0E2Cr;\uC000\u{1D4AA}ash\u803B\xD8\u40D8i\u016C\u0E37\u0E3Cde\u803B\xD5\u40D5es;\u6A37ml\u803B\xD6\u40D6er\u0100BP\u0E4B\u0E60\u0100ar\u0E50\u0E53r;\u603Eac\u0100ek\u0E5A\u0E5C;\u63DEet;\u63B4arenthesis;\u63DC\u0480acfhilors\u0E7F\u0E87\u0E8A\u0E8F\u0E92\u0E94\u0E9D\u0EB0\u0EFCrtialD;\u6202y;\u441Fr;\uC000\u{1D513}i;\u43A6;\u43A0usMinus;\u40B1\u0100ip\u0EA2\u0EADncareplan\xE5\u069Df;\u6119\u0200;eio\u0EB9\u0EBA\u0EE0\u0EE4\u6ABBcedes\u0200;EST\u0EC8\u0EC9\u0ECF\u0EDA\u627Aqual;\u6AAFlantEqual;\u627Cilde;\u627Eme;\u6033\u0100dp\u0EE9\u0EEEuct;\u620Fortion\u0100;a\u0225\u0EF9l;\u621D\u0100ci\u0F01\u0F06r;\uC000\u{1D4AB};\u43A8\u0200Ufos\u0F11\u0F16\u0F1B\u0F1FOT\u803B"\u4022r;\uC000\u{1D514}pf;\u611Acr;\uC000\u{1D4AC}\u0600BEacefhiorsu\u0F3E\u0F43\u0F47\u0F60\u0F73\u0FA7\u0FAA\u0FAD\u1096\u10A9\u10B4\u10BEarr;\u6910G\u803B\xAE\u40AE\u0180cnr\u0F4E\u0F53\u0F56ute;\u4154g;\u67EBr\u0100;t\u0F5C\u0F5D\u61A0l;\u6916\u0180aey\u0F67\u0F6C\u0F71ron;\u4158dil;\u4156;\u4420\u0100;v\u0F78\u0F79\u611Cerse\u0100EU\u0F82\u0F99\u0100lq\u0F87\u0F8Eement;\u620Builibrium;\u61CBpEquilibrium;\u696Fr\xBB\u0F79o;\u43A1ght\u0400ACDFTUVa\u0FC1\u0FEB\u0FF3\u1022\u1028\u105B\u1087\u03D8\u0100nr\u0FC6\u0FD2gleBracket;\u67E9row\u0180;BL\u0FDC\u0FDD\u0FE1\u6192ar;\u61E5eftArrow;\u61C4eiling;\u6309o\u01F5\u0FF9\0\u1005bleBracket;\u67E7n\u01D4\u100A\0\u1014eeVector;\u695Dector\u0100;B\u101D\u101E\u61C2ar;\u6955loor;\u630B\u0100er\u102D\u1043e\u0180;AV\u1035\u1036\u103C\u62A2rrow;\u61A6ector;\u695Biangle\u0180;BE\u1050\u1051\u1055\u62B3ar;\u69D0qual;\u62B5p\u0180DTV\u1063\u106E\u1078ownVector;\u694FeeVector;\u695Cector\u0100;B\u1082\u1083\u61BEar;\u6954ector\u0100;B\u1091\u1092\u61C0ar;\u6953\u0100pu\u109B\u109Ef;\u611DndImplies;\u6970ightarrow;\u61DB\u0100ch\u10B9\u10BCr;\u611B;\u61B1leDelayed;\u69F4\u0680HOacfhimoqstu\u10E4\u10F1\u10F7\u10FD\u1119\u111E\u1151\u1156\u1161\u1167\u11B5\u11BB\u11BF\u0100Cc\u10E9\u10EEHcy;\u4429y;\u4428FTcy;\u442Ccute;\u415A\u0280;aeiy\u1108\u1109\u110E\u1113\u1117\u6ABCron;\u4160dil;\u415Erc;\u415C;\u4421r;\uC000\u{1D516}ort\u0200DLRU\u112A\u1134\u113E\u1149ownArrow\xBB\u041EeftArrow\xBB\u089AightArrow\xBB\u0FDDpArrow;\u6191gma;\u43A3allCircle;\u6218pf;\uC000\u{1D54A}\u0272\u116D\0\0\u1170t;\u621Aare\u0200;ISU\u117B\u117C\u1189\u11AF\u65A1ntersection;\u6293u\u0100bp\u118F\u119Eset\u0100;E\u1197\u1198\u628Fqual;\u6291erset\u0100;E\u11A8\u11A9\u6290qual;\u6292nion;\u6294cr;\uC000\u{1D4AE}ar;\u62C6\u0200bcmp\u11C8\u11DB\u1209\u120B\u0100;s\u11CD\u11CE\u62D0et\u0100;E\u11CD\u11D5qual;\u6286\u0100ch\u11E0\u1205eeds\u0200;EST\u11ED\u11EE\u11F4\u11FF\u627Bqual;\u6AB0lantEqual;\u627Dilde;\u627FTh\xE1\u0F8C;\u6211\u0180;es\u1212\u1213\u1223\u62D1rset\u0100;E\u121C\u121D\u6283qual;\u6287et\xBB\u1213\u0580HRSacfhiors\u123E\u1244\u1249\u1255\u125E\u1271\u1276\u129F\u12C2\u12C8\u12D1ORN\u803B\xDE\u40DEADE;\u6122\u0100Hc\u124E\u1252cy;\u440By;\u4426\u0100bu\u125A\u125C;\u4009;\u43A4\u0180aey\u1265\u126A\u126Fron;\u4164dil;\u4162;\u4422r;\uC000\u{1D517}\u0100ei\u127B\u1289\u01F2\u1280\0\u1287efore;\u6234a;\u4398\u0100cn\u128E\u1298kSpace;\uC000\u205F\u200ASpace;\u6009lde\u0200;EFT\u12AB\u12AC\u12B2\u12BC\u623Cqual;\u6243ullEqual;\u6245ilde;\u6248pf;\uC000\u{1D54B}ipleDot;\u60DB\u0100ct\u12D6\u12DBr;\uC000\u{1D4AF}rok;\u4166\u0AE1\u12F7\u130E\u131A\u1326\0\u132C\u1331\0\0\0\0\0\u1338\u133D\u1377\u1385\0\u13FF\u1404\u140A\u1410\u0100cr\u12FB\u1301ute\u803B\xDA\u40DAr\u0100;o\u1307\u1308\u619Fcir;\u6949r\u01E3\u1313\0\u1316y;\u440Eve;\u416C\u0100iy\u131E\u1323rc\u803B\xDB\u40DB;\u4423blac;\u4170r;\uC000\u{1D518}rave\u803B\xD9\u40D9acr;\u416A\u0100di\u1341\u1369er\u0100BP\u1348\u135D\u0100ar\u134D\u1350r;\u405Fac\u0100ek\u1357\u1359;\u63DFet;\u63B5arenthesis;\u63DDon\u0100;P\u1370\u1371\u62C3lus;\u628E\u0100gp\u137B\u137Fon;\u4172f;\uC000\u{1D54C}\u0400ADETadps\u1395\u13AE\u13B8\u13C4\u03E8\u13D2\u13D7\u13F3rrow\u0180;BD\u1150\u13A0\u13A4ar;\u6912ownArrow;\u61C5ownArrow;\u6195quilibrium;\u696Eee\u0100;A\u13CB\u13CC\u62A5rrow;\u61A5own\xE1\u03F3er\u0100LR\u13DE\u13E8eftArrow;\u6196ightArrow;\u6197i\u0100;l\u13F9\u13FA\u43D2on;\u43A5ing;\u416Ecr;\uC000\u{1D4B0}ilde;\u4168ml\u803B\xDC\u40DC\u0480Dbcdefosv\u1427\u142C\u1430\u1433\u143E\u1485\u148A\u1490\u1496ash;\u62ABar;\u6AEBy;\u4412ash\u0100;l\u143B\u143C\u62A9;\u6AE6\u0100er\u1443\u1445;\u62C1\u0180bty\u144C\u1450\u147Aar;\u6016\u0100;i\u144F\u1455cal\u0200BLST\u1461\u1465\u146A\u1474ar;\u6223ine;\u407Ceparator;\u6758ilde;\u6240ThinSpace;\u600Ar;\uC000\u{1D519}pf;\uC000\u{1D54D}cr;\uC000\u{1D4B1}dash;\u62AA\u0280cefos\u14A7\u14AC\u14B1\u14B6\u14BCirc;\u4174dge;\u62C0r;\uC000\u{1D51A}pf;\uC000\u{1D54E}cr;\uC000\u{1D4B2}\u0200fios\u14CB\u14D0\u14D2\u14D8r;\uC000\u{1D51B};\u439Epf;\uC000\u{1D54F}cr;\uC000\u{1D4B3}\u0480AIUacfosu\u14F1\u14F5\u14F9\u14FD\u1504\u150F\u1514\u151A\u1520cy;\u442Fcy;\u4407cy;\u442Ecute\u803B\xDD\u40DD\u0100iy\u1509\u150Drc;\u4176;\u442Br;\uC000\u{1D51C}pf;\uC000\u{1D550}cr;\uC000\u{1D4B4}ml;\u4178\u0400Hacdefos\u1535\u1539\u153F\u154B\u154F\u155D\u1560\u1564cy;\u4416cute;\u4179\u0100ay\u1544\u1549ron;\u417D;\u4417ot;\u417B\u01F2\u1554\0\u155BoWidt\xE8\u0AD9a;\u4396r;\u6128pf;\u6124cr;\uC000\u{1D4B5}\u0BE1\u1583\u158A\u1590\0\u15B0\u15B6\u15BF\0\0\0\0\u15C6\u15DB\u15EB\u165F\u166D\0\u1695\u169B\u16B2\u16B9\0\u16BEcute\u803B\xE1\u40E1reve;\u4103\u0300;Ediuy\u159C\u159D\u15A1\u15A3\u15A8\u15AD\u623E;\uC000\u223E\u0333;\u623Frc\u803B\xE2\u40E2te\u80BB\xB4\u0306;\u4430lig\u803B\xE6\u40E6\u0100;r\xB2\u15BA;\uC000\u{1D51E}rave\u803B\xE0\u40E0\u0100ep\u15CA\u15D6\u0100fp\u15CF\u15D4sym;\u6135\xE8\u15D3ha;\u43B1\u0100ap\u15DFc\u0100cl\u15E4\u15E7r;\u4101g;\u6A3F\u0264\u15F0\0\0\u160A\u0280;adsv\u15FA\u15FB\u15FF\u1601\u1607\u6227nd;\u6A55;\u6A5Clope;\u6A58;\u6A5A\u0380;elmrsz\u1618\u1619\u161B\u161E\u163F\u164F\u1659\u6220;\u69A4e\xBB\u1619sd\u0100;a\u1625\u1626\u6221\u0461\u1630\u1632\u1634\u1636\u1638\u163A\u163C\u163E;\u69A8;\u69A9;\u69AA;\u69AB;\u69AC;\u69AD;\u69AE;\u69AFt\u0100;v\u1645\u1646\u621Fb\u0100;d\u164C\u164D\u62BE;\u699D\u0100pt\u1654\u1657h;\u6222\xBB\xB9arr;\u637C\u0100gp\u1663\u1667on;\u4105f;\uC000\u{1D552}\u0380;Eaeiop\u12C1\u167B\u167D\u1682\u1684\u1687\u168A;\u6A70cir;\u6A6F;\u624Ad;\u624Bs;\u4027rox\u0100;e\u12C1\u1692\xF1\u1683ing\u803B\xE5\u40E5\u0180cty\u16A1\u16A6\u16A8r;\uC000\u{1D4B6};\u402Amp\u0100;e\u12C1\u16AF\xF1\u0288ilde\u803B\xE3\u40E3ml\u803B\xE4\u40E4\u0100ci\u16C2\u16C8onin\xF4\u0272nt;\u6A11\u0800Nabcdefiklnoprsu\u16ED\u16F1\u1730\u173C\u1743\u1748\u1778\u177D\u17E0\u17E6\u1839\u1850\u170D\u193D\u1948\u1970ot;\u6AED\u0100cr\u16F6\u171Ek\u0200ceps\u1700\u1705\u170D\u1713ong;\u624Cpsilon;\u43F6rime;\u6035im\u0100;e\u171A\u171B\u623Dq;\u62CD\u0176\u1722\u1726ee;\u62BDed\u0100;g\u172C\u172D\u6305e\xBB\u172Drk\u0100;t\u135C\u1737brk;\u63B6\u0100oy\u1701\u1741;\u4431quo;\u601E\u0280cmprt\u1753\u175B\u1761\u1764\u1768aus\u0100;e\u010A\u0109ptyv;\u69B0s\xE9\u170Cno\xF5\u0113\u0180ahw\u176F\u1771\u1773;\u43B2;\u6136een;\u626Cr;\uC000\u{1D51F}g\u0380costuvw\u178D\u179D\u17B3\u17C1\u17D5\u17DB\u17DE\u0180aiu\u1794\u1796\u179A\xF0\u0760rc;\u65EFp\xBB\u1371\u0180dpt\u17A4\u17A8\u17ADot;\u6A00lus;\u6A01imes;\u6A02\u0271\u17B9\0\0\u17BEcup;\u6A06ar;\u6605riangle\u0100du\u17CD\u17D2own;\u65BDp;\u65B3plus;\u6A04e\xE5\u1444\xE5\u14ADarow;\u690D\u0180ako\u17ED\u1826\u1835\u0100cn\u17F2\u1823k\u0180lst\u17FA\u05AB\u1802ozenge;\u69EBriangle\u0200;dlr\u1812\u1813\u1818\u181D\u65B4own;\u65BEeft;\u65C2ight;\u65B8k;\u6423\u01B1\u182B\0\u1833\u01B2\u182F\0\u1831;\u6592;\u65914;\u6593ck;\u6588\u0100eo\u183E\u184D\u0100;q\u1843\u1846\uC000=\u20E5uiv;\uC000\u2261\u20E5t;\u6310\u0200ptwx\u1859\u185E\u1867\u186Cf;\uC000\u{1D553}\u0100;t\u13CB\u1863om\xBB\u13CCtie;\u62C8\u0600DHUVbdhmptuv\u1885\u1896\u18AA\u18BB\u18D7\u18DB\u18EC\u18FF\u1905\u190A\u1910\u1921\u0200LRlr\u188E\u1890\u1892\u1894;\u6557;\u6554;\u6556;\u6553\u0280;DUdu\u18A1\u18A2\u18A4\u18A6\u18A8\u6550;\u6566;\u6569;\u6564;\u6567\u0200LRlr\u18B3\u18B5\u18B7\u18B9;\u655D;\u655A;\u655C;\u6559\u0380;HLRhlr\u18CA\u18CB\u18CD\u18CF\u18D1\u18D3\u18D5\u6551;\u656C;\u6563;\u6560;\u656B;\u6562;\u655Fox;\u69C9\u0200LRlr\u18E4\u18E6\u18E8\u18EA;\u6555;\u6552;\u6510;\u650C\u0280;DUdu\u06BD\u18F7\u18F9\u18FB\u18FD;\u6565;\u6568;\u652C;\u6534inus;\u629Flus;\u629Eimes;\u62A0\u0200LRlr\u1919\u191B\u191D\u191F;\u655B;\u6558;\u6518;\u6514\u0380;HLRhlr\u1930\u1931\u1933\u1935\u1937\u1939\u193B\u6502;\u656A;\u6561;\u655E;\u653C;\u6524;\u651C\u0100ev\u0123\u1942bar\u803B\xA6\u40A6\u0200ceio\u1951\u1956\u195A\u1960r;\uC000\u{1D4B7}mi;\u604Fm\u0100;e\u171A\u171Cl\u0180;bh\u1968\u1969\u196B\u405C;\u69C5sub;\u67C8\u016C\u1974\u197El\u0100;e\u1979\u197A\u6022t\xBB\u197Ap\u0180;Ee\u012F\u1985\u1987;\u6AAE\u0100;q\u06DC\u06DB\u0CE1\u19A7\0\u19E8\u1A11\u1A15\u1A32\0\u1A37\u1A50\0\0\u1AB4\0\0\u1AC1\0\0\u1B21\u1B2E\u1B4D\u1B52\0\u1BFD\0\u1C0C\u0180cpr\u19AD\u19B2\u19DDute;\u4107\u0300;abcds\u19BF\u19C0\u19C4\u19CA\u19D5\u19D9\u6229nd;\u6A44rcup;\u6A49\u0100au\u19CF\u19D2p;\u6A4Bp;\u6A47ot;\u6A40;\uC000\u2229\uFE00\u0100eo\u19E2\u19E5t;\u6041\xEE\u0693\u0200aeiu\u19F0\u19FB\u1A01\u1A05\u01F0\u19F5\0\u19F8s;\u6A4Don;\u410Ddil\u803B\xE7\u40E7rc;\u4109ps\u0100;s\u1A0C\u1A0D\u6A4Cm;\u6A50ot;\u410B\u0180dmn\u1A1B\u1A20\u1A26il\u80BB\xB8\u01ADptyv;\u69B2t\u8100\xA2;e\u1A2D\u1A2E\u40A2r\xE4\u01B2r;\uC000\u{1D520}\u0180cei\u1A3D\u1A40\u1A4Dy;\u4447ck\u0100;m\u1A47\u1A48\u6713ark\xBB\u1A48;\u43C7r\u0380;Ecefms\u1A5F\u1A60\u1A62\u1A6B\u1AA4\u1AAA\u1AAE\u65CB;\u69C3\u0180;el\u1A69\u1A6A\u1A6D\u42C6q;\u6257e\u0261\u1A74\0\0\u1A88rrow\u0100lr\u1A7C\u1A81eft;\u61BAight;\u61BB\u0280RSacd\u1A92\u1A94\u1A96\u1A9A\u1A9F\xBB\u0F47;\u64C8st;\u629Birc;\u629Aash;\u629Dnint;\u6A10id;\u6AEFcir;\u69C2ubs\u0100;u\u1ABB\u1ABC\u6663it\xBB\u1ABC\u02EC\u1AC7\u1AD4\u1AFA\0\u1B0Aon\u0100;e\u1ACD\u1ACE\u403A\u0100;q\xC7\xC6\u026D\u1AD9\0\0\u1AE2a\u0100;t\u1ADE\u1ADF\u402C;\u4040\u0180;fl\u1AE8\u1AE9\u1AEB\u6201\xEE\u1160e\u0100mx\u1AF1\u1AF6ent\xBB\u1AE9e\xF3\u024D\u01E7\u1AFE\0\u1B07\u0100;d\u12BB\u1B02ot;\u6A6Dn\xF4\u0246\u0180fry\u1B10\u1B14\u1B17;\uC000\u{1D554}o\xE4\u0254\u8100\xA9;s\u0155\u1B1Dr;\u6117\u0100ao\u1B25\u1B29rr;\u61B5ss;\u6717\u0100cu\u1B32\u1B37r;\uC000\u{1D4B8}\u0100bp\u1B3C\u1B44\u0100;e\u1B41\u1B42\u6ACF;\u6AD1\u0100;e\u1B49\u1B4A\u6AD0;\u6AD2dot;\u62EF\u0380delprvw\u1B60\u1B6C\u1B77\u1B82\u1BAC\u1BD4\u1BF9arr\u0100lr\u1B68\u1B6A;\u6938;\u6935\u0270\u1B72\0\0\u1B75r;\u62DEc;\u62DFarr\u0100;p\u1B7F\u1B80\u61B6;\u693D\u0300;bcdos\u1B8F\u1B90\u1B96\u1BA1\u1BA5\u1BA8\u622Arcap;\u6A48\u0100au\u1B9B\u1B9Ep;\u6A46p;\u6A4Aot;\u628Dr;\u6A45;\uC000\u222A\uFE00\u0200alrv\u1BB5\u1BBF\u1BDE\u1BE3rr\u0100;m\u1BBC\u1BBD\u61B7;\u693Cy\u0180evw\u1BC7\u1BD4\u1BD8q\u0270\u1BCE\0\0\u1BD2re\xE3\u1B73u\xE3\u1B75ee;\u62CEedge;\u62CFen\u803B\xA4\u40A4earrow\u0100lr\u1BEE\u1BF3eft\xBB\u1B80ight\xBB\u1BBDe\xE4\u1BDD\u0100ci\u1C01\u1C07onin\xF4\u01F7nt;\u6231lcty;\u632D\u0980AHabcdefhijlorstuwz\u1C38\u1C3B\u1C3F\u1C5D\u1C69\u1C75\u1C8A\u1C9E\u1CAC\u1CB7\u1CFB\u1CFF\u1D0D\u1D7B\u1D91\u1DAB\u1DBB\u1DC6\u1DCDr\xF2\u0381ar;\u6965\u0200glrs\u1C48\u1C4D\u1C52\u1C54ger;\u6020eth;\u6138\xF2\u1133h\u0100;v\u1C5A\u1C5B\u6010\xBB\u090A\u016B\u1C61\u1C67arow;\u690Fa\xE3\u0315\u0100ay\u1C6E\u1C73ron;\u410F;\u4434\u0180;ao\u0332\u1C7C\u1C84\u0100gr\u02BF\u1C81r;\u61CAtseq;\u6A77\u0180glm\u1C91\u1C94\u1C98\u803B\xB0\u40B0ta;\u43B4ptyv;\u69B1\u0100ir\u1CA3\u1CA8sht;\u697F;\uC000\u{1D521}ar\u0100lr\u1CB3\u1CB5\xBB\u08DC\xBB\u101E\u0280aegsv\u1CC2\u0378\u1CD6\u1CDC\u1CE0m\u0180;os\u0326\u1CCA\u1CD4nd\u0100;s\u0326\u1CD1uit;\u6666amma;\u43DDin;\u62F2\u0180;io\u1CE7\u1CE8\u1CF8\u40F7de\u8100\xF7;o\u1CE7\u1CF0ntimes;\u62C7n\xF8\u1CF7cy;\u4452c\u026F\u1D06\0\0\u1D0Arn;\u631Eop;\u630D\u0280lptuw\u1D18\u1D1D\u1D22\u1D49\u1D55lar;\u4024f;\uC000\u{1D555}\u0280;emps\u030B\u1D2D\u1D37\u1D3D\u1D42q\u0100;d\u0352\u1D33ot;\u6251inus;\u6238lus;\u6214quare;\u62A1blebarwedg\xE5\xFAn\u0180adh\u112E\u1D5D\u1D67ownarrow\xF3\u1C83arpoon\u0100lr\u1D72\u1D76ef\xF4\u1CB4igh\xF4\u1CB6\u0162\u1D7F\u1D85karo\xF7\u0F42\u026F\u1D8A\0\0\u1D8Ern;\u631Fop;\u630C\u0180cot\u1D98\u1DA3\u1DA6\u0100ry\u1D9D\u1DA1;\uC000\u{1D4B9};\u4455l;\u69F6rok;\u4111\u0100dr\u1DB0\u1DB4ot;\u62F1i\u0100;f\u1DBA\u1816\u65BF\u0100ah\u1DC0\u1DC3r\xF2\u0429a\xF2\u0FA6angle;\u69A6\u0100ci\u1DD2\u1DD5y;\u445Fgrarr;\u67FF\u0900Dacdefglmnopqrstux\u1E01\u1E09\u1E19\u1E38\u0578\u1E3C\u1E49\u1E61\u1E7E\u1EA5\u1EAF\u1EBD\u1EE1\u1F2A\u1F37\u1F44\u1F4E\u1F5A\u0100Do\u1E06\u1D34o\xF4\u1C89\u0100cs\u1E0E\u1E14ute\u803B\xE9\u40E9ter;\u6A6E\u0200aioy\u1E22\u1E27\u1E31\u1E36ron;\u411Br\u0100;c\u1E2D\u1E2E\u6256\u803B\xEA\u40EAlon;\u6255;\u444Dot;\u4117\u0100Dr\u1E41\u1E45ot;\u6252;\uC000\u{1D522}\u0180;rs\u1E50\u1E51\u1E57\u6A9Aave\u803B\xE8\u40E8\u0100;d\u1E5C\u1E5D\u6A96ot;\u6A98\u0200;ils\u1E6A\u1E6B\u1E72\u1E74\u6A99nters;\u63E7;\u6113\u0100;d\u1E79\u1E7A\u6A95ot;\u6A97\u0180aps\u1E85\u1E89\u1E97cr;\u4113ty\u0180;sv\u1E92\u1E93\u1E95\u6205et\xBB\u1E93p\u01001;\u1E9D\u1EA4\u0133\u1EA1\u1EA3;\u6004;\u6005\u6003\u0100gs\u1EAA\u1EAC;\u414Bp;\u6002\u0100gp\u1EB4\u1EB8on;\u4119f;\uC000\u{1D556}\u0180als\u1EC4\u1ECE\u1ED2r\u0100;s\u1ECA\u1ECB\u62D5l;\u69E3us;\u6A71i\u0180;lv\u1EDA\u1EDB\u1EDF\u43B5on\xBB\u1EDB;\u43F5\u0200csuv\u1EEA\u1EF3\u1F0B\u1F23\u0100io\u1EEF\u1E31rc\xBB\u1E2E\u0269\u1EF9\0\0\u1EFB\xED\u0548ant\u0100gl\u1F02\u1F06tr\xBB\u1E5Dess\xBB\u1E7A\u0180aei\u1F12\u1F16\u1F1Als;\u403Dst;\u625Fv\u0100;D\u0235\u1F20D;\u6A78parsl;\u69E5\u0100Da\u1F2F\u1F33ot;\u6253rr;\u6971\u0180cdi\u1F3E\u1F41\u1EF8r;\u612Fo\xF4\u0352\u0100ah\u1F49\u1F4B;\u43B7\u803B\xF0\u40F0\u0100mr\u1F53\u1F57l\u803B\xEB\u40EBo;\u60AC\u0180cip\u1F61\u1F64\u1F67l;\u4021s\xF4\u056E\u0100eo\u1F6C\u1F74ctatio\xEE\u0559nential\xE5\u0579\u09E1\u1F92\0\u1F9E\0\u1FA1\u1FA7\0\0\u1FC6\u1FCC\0\u1FD3\0\u1FE6\u1FEA\u2000\0\u2008\u205Allingdotse\xF1\u1E44y;\u4444male;\u6640\u0180ilr\u1FAD\u1FB3\u1FC1lig;\u8000\uFB03\u0269\u1FB9\0\0\u1FBDg;\u8000\uFB00ig;\u8000\uFB04;\uC000\u{1D523}lig;\u8000\uFB01lig;\uC000fj\u0180alt\u1FD9\u1FDC\u1FE1t;\u666Dig;\u8000\uFB02ns;\u65B1of;\u4192\u01F0\u1FEE\0\u1FF3f;\uC000\u{1D557}\u0100ak\u05BF\u1FF7\u0100;v\u1FFC\u1FFD\u62D4;\u6AD9artint;\u6A0D\u0100ao\u200C\u2055\u0100cs\u2011\u2052\u03B1\u201A\u2030\u2038\u2045\u2048\0\u2050\u03B2\u2022\u2025\u2027\u202A\u202C\0\u202E\u803B\xBD\u40BD;\u6153\u803B\xBC\u40BC;\u6155;\u6159;\u615B\u01B3\u2034\0\u2036;\u6154;\u6156\u02B4\u203E\u2041\0\0\u2043\u803B\xBE\u40BE;\u6157;\u615C5;\u6158\u01B6\u204C\0\u204E;\u615A;\u615D8;\u615El;\u6044wn;\u6322cr;\uC000\u{1D4BB}\u0880Eabcdefgijlnorstv\u2082\u2089\u209F\u20A5\u20B0\u20B4\u20F0\u20F5\u20FA\u20FF\u2103\u2112\u2138\u0317\u213E\u2152\u219E\u0100;l\u064D\u2087;\u6A8C\u0180cmp\u2090\u2095\u209Dute;\u41F5ma\u0100;d\u209C\u1CDA\u43B3;\u6A86reve;\u411F\u0100iy\u20AA\u20AErc;\u411D;\u4433ot;\u4121\u0200;lqs\u063E\u0642\u20BD\u20C9\u0180;qs\u063E\u064C\u20C4lan\xF4\u0665\u0200;cdl\u0665\u20D2\u20D5\u20E5c;\u6AA9ot\u0100;o\u20DC\u20DD\u6A80\u0100;l\u20E2\u20E3\u6A82;\u6A84\u0100;e\u20EA\u20ED\uC000\u22DB\uFE00s;\u6A94r;\uC000\u{1D524}\u0100;g\u0673\u061Bmel;\u6137cy;\u4453\u0200;Eaj\u065A\u210C\u210E\u2110;\u6A92;\u6AA5;\u6AA4\u0200Eaes\u211B\u211D\u2129\u2134;\u6269p\u0100;p\u2123\u2124\u6A8Arox\xBB\u2124\u0100;q\u212E\u212F\u6A88\u0100;q\u212E\u211Bim;\u62E7pf;\uC000\u{1D558}\u0100ci\u2143\u2146r;\u610Am\u0180;el\u066B\u214E\u2150;\u6A8E;\u6A90\u8300>;cdlqr\u05EE\u2160\u216A\u216E\u2173\u2179\u0100ci\u2165\u2167;\u6AA7r;\u6A7Aot;\u62D7Par;\u6995uest;\u6A7C\u0280adels\u2184\u216A\u2190\u0656\u219B\u01F0\u2189\0\u218Epro\xF8\u209Er;\u6978q\u0100lq\u063F\u2196les\xF3\u2088i\xED\u066B\u0100en\u21A3\u21ADrtneqq;\uC000\u2269\uFE00\xC5\u21AA\u0500Aabcefkosy\u21C4\u21C7\u21F1\u21F5\u21FA\u2218\u221D\u222F\u2268\u227Dr\xF2\u03A0\u0200ilmr\u21D0\u21D4\u21D7\u21DBrs\xF0\u1484f\xBB\u2024il\xF4\u06A9\u0100dr\u21E0\u21E4cy;\u444A\u0180;cw\u08F4\u21EB\u21EFir;\u6948;\u61ADar;\u610Firc;\u4125\u0180alr\u2201\u220E\u2213rts\u0100;u\u2209\u220A\u6665it\xBB\u220Alip;\u6026con;\u62B9r;\uC000\u{1D525}s\u0100ew\u2223\u2229arow;\u6925arow;\u6926\u0280amopr\u223A\u223E\u2243\u225E\u2263rr;\u61FFtht;\u623Bk\u0100lr\u2249\u2253eftarrow;\u61A9ightarrow;\u61AAf;\uC000\u{1D559}bar;\u6015\u0180clt\u226F\u2274\u2278r;\uC000\u{1D4BD}as\xE8\u21F4rok;\u4127\u0100bp\u2282\u2287ull;\u6043hen\xBB\u1C5B\u0AE1\u22A3\0\u22AA\0\u22B8\u22C5\u22CE\0\u22D5\u22F3\0\0\u22F8\u2322\u2367\u2362\u237F\0\u2386\u23AA\u23B4cute\u803B\xED\u40ED\u0180;iy\u0771\u22B0\u22B5rc\u803B\xEE\u40EE;\u4438\u0100cx\u22BC\u22BFy;\u4435cl\u803B\xA1\u40A1\u0100fr\u039F\u22C9;\uC000\u{1D526}rave\u803B\xEC\u40EC\u0200;ino\u073E\u22DD\u22E9\u22EE\u0100in\u22E2\u22E6nt;\u6A0Ct;\u622Dfin;\u69DCta;\u6129lig;\u4133\u0180aop\u22FE\u231A\u231D\u0180cgt\u2305\u2308\u2317r;\u412B\u0180elp\u071F\u230F\u2313in\xE5\u078Ear\xF4\u0720h;\u4131f;\u62B7ed;\u41B5\u0280;cfot\u04F4\u232C\u2331\u233D\u2341are;\u6105in\u0100;t\u2338\u2339\u621Eie;\u69DDdo\xF4\u2319\u0280;celp\u0757\u234C\u2350\u235B\u2361al;\u62BA\u0100gr\u2355\u2359er\xF3\u1563\xE3\u234Darhk;\u6A17rod;\u6A3C\u0200cgpt\u236F\u2372\u2376\u237By;\u4451on;\u412Ff;\uC000\u{1D55A}a;\u43B9uest\u803B\xBF\u40BF\u0100ci\u238A\u238Fr;\uC000\u{1D4BE}n\u0280;Edsv\u04F4\u239B\u239D\u23A1\u04F3;\u62F9ot;\u62F5\u0100;v\u23A6\u23A7\u62F4;\u62F3\u0100;i\u0777\u23AElde;\u4129\u01EB\u23B8\0\u23BCcy;\u4456l\u803B\xEF\u40EF\u0300cfmosu\u23CC\u23D7\u23DC\u23E1\u23E7\u23F5\u0100iy\u23D1\u23D5rc;\u4135;\u4439r;\uC000\u{1D527}ath;\u4237pf;\uC000\u{1D55B}\u01E3\u23EC\0\u23F1r;\uC000\u{1D4BF}rcy;\u4458kcy;\u4454\u0400acfghjos\u240B\u2416\u2422\u2427\u242D\u2431\u2435\u243Bppa\u0100;v\u2413\u2414\u43BA;\u43F0\u0100ey\u241B\u2420dil;\u4137;\u443Ar;\uC000\u{1D528}reen;\u4138cy;\u4445cy;\u445Cpf;\uC000\u{1D55C}cr;\uC000\u{1D4C0}\u0B80ABEHabcdefghjlmnoprstuv\u2470\u2481\u2486\u248D\u2491\u250E\u253D\u255A\u2580\u264E\u265E\u2665\u2679\u267D\u269A\u26B2\u26D8\u275D\u2768\u278B\u27C0\u2801\u2812\u0180art\u2477\u247A\u247Cr\xF2\u09C6\xF2\u0395ail;\u691Barr;\u690E\u0100;g\u0994\u248B;\u6A8Bar;\u6962\u0963\u24A5\0\u24AA\0\u24B1\0\0\0\0\0\u24B5\u24BA\0\u24C6\u24C8\u24CD\0\u24F9ute;\u413Amptyv;\u69B4ra\xEE\u084Cbda;\u43BBg\u0180;dl\u088E\u24C1\u24C3;\u6991\xE5\u088E;\u6A85uo\u803B\xAB\u40ABr\u0400;bfhlpst\u0899\u24DE\u24E6\u24E9\u24EB\u24EE\u24F1\u24F5\u0100;f\u089D\u24E3s;\u691Fs;\u691D\xEB\u2252p;\u61ABl;\u6939im;\u6973l;\u61A2\u0180;ae\u24FF\u2500\u2504\u6AABil;\u6919\u0100;s\u2509\u250A\u6AAD;\uC000\u2AAD\uFE00\u0180abr\u2515\u2519\u251Drr;\u690Crk;\u6772\u0100ak\u2522\u252Cc\u0100ek\u2528\u252A;\u407B;\u405B\u0100es\u2531\u2533;\u698Bl\u0100du\u2539\u253B;\u698F;\u698D\u0200aeuy\u2546\u254B\u2556\u2558ron;\u413E\u0100di\u2550\u2554il;\u413C\xEC\u08B0\xE2\u2529;\u443B\u0200cqrs\u2563\u2566\u256D\u257Da;\u6936uo\u0100;r\u0E19\u1746\u0100du\u2572\u2577har;\u6967shar;\u694Bh;\u61B2\u0280;fgqs\u258B\u258C\u0989\u25F3\u25FF\u6264t\u0280ahlrt\u2598\u25A4\u25B7\u25C2\u25E8rrow\u0100;t\u0899\u25A1a\xE9\u24F6arpoon\u0100du\u25AF\u25B4own\xBB\u045Ap\xBB\u0966eftarrows;\u61C7ight\u0180ahs\u25CD\u25D6\u25DErrow\u0100;s\u08F4\u08A7arpoon\xF3\u0F98quigarro\xF7\u21F0hreetimes;\u62CB\u0180;qs\u258B\u0993\u25FAlan\xF4\u09AC\u0280;cdgs\u09AC\u260A\u260D\u261D\u2628c;\u6AA8ot\u0100;o\u2614\u2615\u6A7F\u0100;r\u261A\u261B\u6A81;\u6A83\u0100;e\u2622\u2625\uC000\u22DA\uFE00s;\u6A93\u0280adegs\u2633\u2639\u263D\u2649\u264Bppro\xF8\u24C6ot;\u62D6q\u0100gq\u2643\u2645\xF4\u0989gt\xF2\u248C\xF4\u099Bi\xED\u09B2\u0180ilr\u2655\u08E1\u265Asht;\u697C;\uC000\u{1D529}\u0100;E\u099C\u2663;\u6A91\u0161\u2669\u2676r\u0100du\u25B2\u266E\u0100;l\u0965\u2673;\u696Alk;\u6584cy;\u4459\u0280;acht\u0A48\u2688\u268B\u2691\u2696r\xF2\u25C1orne\xF2\u1D08ard;\u696Bri;\u65FA\u0100io\u269F\u26A4dot;\u4140ust\u0100;a\u26AC\u26AD\u63B0che\xBB\u26AD\u0200Eaes\u26BB\u26BD\u26C9\u26D4;\u6268p\u0100;p\u26C3\u26C4\u6A89rox\xBB\u26C4\u0100;q\u26CE\u26CF\u6A87\u0100;q\u26CE\u26BBim;\u62E6\u0400abnoptwz\u26E9\u26F4\u26F7\u271A\u272F\u2741\u2747\u2750\u0100nr\u26EE\u26F1g;\u67ECr;\u61FDr\xEB\u08C1g\u0180lmr\u26FF\u270D\u2714eft\u0100ar\u09E6\u2707ight\xE1\u09F2apsto;\u67FCight\xE1\u09FDparrow\u0100lr\u2725\u2729ef\xF4\u24EDight;\u61AC\u0180afl\u2736\u2739\u273Dr;\u6985;\uC000\u{1D55D}us;\u6A2Dimes;\u6A34\u0161\u274B\u274Fst;\u6217\xE1\u134E\u0180;ef\u2757\u2758\u1800\u65CAnge\xBB\u2758ar\u0100;l\u2764\u2765\u4028t;\u6993\u0280achmt\u2773\u2776\u277C\u2785\u2787r\xF2\u08A8orne\xF2\u1D8Car\u0100;d\u0F98\u2783;\u696D;\u600Eri;\u62BF\u0300achiqt\u2798\u279D\u0A40\u27A2\u27AE\u27BBquo;\u6039r;\uC000\u{1D4C1}m\u0180;eg\u09B2\u27AA\u27AC;\u6A8D;\u6A8F\u0100bu\u252A\u27B3o\u0100;r\u0E1F\u27B9;\u601Arok;\u4142\u8400<;cdhilqr\u082B\u27D2\u2639\u27DC\u27E0\u27E5\u27EA\u27F0\u0100ci\u27D7\u27D9;\u6AA6r;\u6A79re\xE5\u25F2mes;\u62C9arr;\u6976uest;\u6A7B\u0100Pi\u27F5\u27F9ar;\u6996\u0180;ef\u2800\u092D\u181B\u65C3r\u0100du\u2807\u280Dshar;\u694Ahar;\u6966\u0100en\u2817\u2821rtneqq;\uC000\u2268\uFE00\xC5\u281E\u0700Dacdefhilnopsu\u2840\u2845\u2882\u288E\u2893\u28A0\u28A5\u28A8\u28DA\u28E2\u28E4\u0A83\u28F3\u2902Dot;\u623A\u0200clpr\u284E\u2852\u2863\u287Dr\u803B\xAF\u40AF\u0100et\u2857\u2859;\u6642\u0100;e\u285E\u285F\u6720se\xBB\u285F\u0100;s\u103B\u2868to\u0200;dlu\u103B\u2873\u2877\u287Bow\xEE\u048Cef\xF4\u090F\xF0\u13D1ker;\u65AE\u0100oy\u2887\u288Cmma;\u6A29;\u443Cash;\u6014asuredangle\xBB\u1626r;\uC000\u{1D52A}o;\u6127\u0180cdn\u28AF\u28B4\u28C9ro\u803B\xB5\u40B5\u0200;acd\u1464\u28BD\u28C0\u28C4s\xF4\u16A7ir;\u6AF0ot\u80BB\xB7\u01B5us\u0180;bd\u28D2\u1903\u28D3\u6212\u0100;u\u1D3C\u28D8;\u6A2A\u0163\u28DE\u28E1p;\u6ADB\xF2\u2212\xF0\u0A81\u0100dp\u28E9\u28EEels;\u62A7f;\uC000\u{1D55E}\u0100ct\u28F8\u28FDr;\uC000\u{1D4C2}pos\xBB\u159D\u0180;lm\u2909\u290A\u290D\u43BCtimap;\u62B8\u0C00GLRVabcdefghijlmoprstuvw\u2942\u2953\u297E\u2989\u2998\u29DA\u29E9\u2A15\u2A1A\u2A58\u2A5D\u2A83\u2A95\u2AA4\u2AA8\u2B04\u2B07\u2B44\u2B7F\u2BAE\u2C34\u2C67\u2C7C\u2CE9\u0100gt\u2947\u294B;\uC000\u22D9\u0338\u0100;v\u2950\u0BCF\uC000\u226B\u20D2\u0180elt\u295A\u2972\u2976ft\u0100ar\u2961\u2967rrow;\u61CDightarrow;\u61CE;\uC000\u22D8\u0338\u0100;v\u297B\u0C47\uC000\u226A\u20D2ightarrow;\u61CF\u0100Dd\u298E\u2993ash;\u62AFash;\u62AE\u0280bcnpt\u29A3\u29A7\u29AC\u29B1\u29CCla\xBB\u02DEute;\u4144g;\uC000\u2220\u20D2\u0280;Eiop\u0D84\u29BC\u29C0\u29C5\u29C8;\uC000\u2A70\u0338d;\uC000\u224B\u0338s;\u4149ro\xF8\u0D84ur\u0100;a\u29D3\u29D4\u666El\u0100;s\u29D3\u0B38\u01F3\u29DF\0\u29E3p\u80BB\xA0\u0B37mp\u0100;e\u0BF9\u0C00\u0280aeouy\u29F4\u29FE\u2A03\u2A10\u2A13\u01F0\u29F9\0\u29FB;\u6A43on;\u4148dil;\u4146ng\u0100;d\u0D7E\u2A0Aot;\uC000\u2A6D\u0338p;\u6A42;\u443Dash;\u6013\u0380;Aadqsx\u0B92\u2A29\u2A2D\u2A3B\u2A41\u2A45\u2A50rr;\u61D7r\u0100hr\u2A33\u2A36k;\u6924\u0100;o\u13F2\u13F0ot;\uC000\u2250\u0338ui\xF6\u0B63\u0100ei\u2A4A\u2A4Ear;\u6928\xED\u0B98ist\u0100;s\u0BA0\u0B9Fr;\uC000\u{1D52B}\u0200Eest\u0BC5\u2A66\u2A79\u2A7C\u0180;qs\u0BBC\u2A6D\u0BE1\u0180;qs\u0BBC\u0BC5\u2A74lan\xF4\u0BE2i\xED\u0BEA\u0100;r\u0BB6\u2A81\xBB\u0BB7\u0180Aap\u2A8A\u2A8D\u2A91r\xF2\u2971rr;\u61AEar;\u6AF2\u0180;sv\u0F8D\u2A9C\u0F8C\u0100;d\u2AA1\u2AA2\u62FC;\u62FAcy;\u445A\u0380AEadest\u2AB7\u2ABA\u2ABE\u2AC2\u2AC5\u2AF6\u2AF9r\xF2\u2966;\uC000\u2266\u0338rr;\u619Ar;\u6025\u0200;fqs\u0C3B\u2ACE\u2AE3\u2AEFt\u0100ar\u2AD4\u2AD9rro\xF7\u2AC1ightarro\xF7\u2A90\u0180;qs\u0C3B\u2ABA\u2AEAlan\xF4\u0C55\u0100;s\u0C55\u2AF4\xBB\u0C36i\xED\u0C5D\u0100;r\u0C35\u2AFEi\u0100;e\u0C1A\u0C25i\xE4\u0D90\u0100pt\u2B0C\u2B11f;\uC000\u{1D55F}\u8180\xAC;in\u2B19\u2B1A\u2B36\u40ACn\u0200;Edv\u0B89\u2B24\u2B28\u2B2E;\uC000\u22F9\u0338ot;\uC000\u22F5\u0338\u01E1\u0B89\u2B33\u2B35;\u62F7;\u62F6i\u0100;v\u0CB8\u2B3C\u01E1\u0CB8\u2B41\u2B43;\u62FE;\u62FD\u0180aor\u2B4B\u2B63\u2B69r\u0200;ast\u0B7B\u2B55\u2B5A\u2B5Flle\xEC\u0B7Bl;\uC000\u2AFD\u20E5;\uC000\u2202\u0338lint;\u6A14\u0180;ce\u0C92\u2B70\u2B73u\xE5\u0CA5\u0100;c\u0C98\u2B78\u0100;e\u0C92\u2B7D\xF1\u0C98\u0200Aait\u2B88\u2B8B\u2B9D\u2BA7r\xF2\u2988rr\u0180;cw\u2B94\u2B95\u2B99\u619B;\uC000\u2933\u0338;\uC000\u219D\u0338ghtarrow\xBB\u2B95ri\u0100;e\u0CCB\u0CD6\u0380chimpqu\u2BBD\u2BCD\u2BD9\u2B04\u0B78\u2BE4\u2BEF\u0200;cer\u0D32\u2BC6\u0D37\u2BC9u\xE5\u0D45;\uC000\u{1D4C3}ort\u026D\u2B05\0\0\u2BD6ar\xE1\u2B56m\u0100;e\u0D6E\u2BDF\u0100;q\u0D74\u0D73su\u0100bp\u2BEB\u2BED\xE5\u0CF8\xE5\u0D0B\u0180bcp\u2BF6\u2C11\u2C19\u0200;Ees\u2BFF\u2C00\u0D22\u2C04\u6284;\uC000\u2AC5\u0338et\u0100;e\u0D1B\u2C0Bq\u0100;q\u0D23\u2C00c\u0100;e\u0D32\u2C17\xF1\u0D38\u0200;Ees\u2C22\u2C23\u0D5F\u2C27\u6285;\uC000\u2AC6\u0338et\u0100;e\u0D58\u2C2Eq\u0100;q\u0D60\u2C23\u0200gilr\u2C3D\u2C3F\u2C45\u2C47\xEC\u0BD7lde\u803B\xF1\u40F1\xE7\u0C43iangle\u0100lr\u2C52\u2C5Ceft\u0100;e\u0C1A\u2C5A\xF1\u0C26ight\u0100;e\u0CCB\u2C65\xF1\u0CD7\u0100;m\u2C6C\u2C6D\u43BD\u0180;es\u2C74\u2C75\u2C79\u4023ro;\u6116p;\u6007\u0480DHadgilrs\u2C8F\u2C94\u2C99\u2C9E\u2CA3\u2CB0\u2CB6\u2CD3\u2CE3ash;\u62ADarr;\u6904p;\uC000\u224D\u20D2ash;\u62AC\u0100et\u2CA8\u2CAC;\uC000\u2265\u20D2;\uC000>\u20D2nfin;\u69DE\u0180Aet\u2CBD\u2CC1\u2CC5rr;\u6902;\uC000\u2264\u20D2\u0100;r\u2CCA\u2CCD\uC000<\u20D2ie;\uC000\u22B4\u20D2\u0100At\u2CD8\u2CDCrr;\u6903rie;\uC000\u22B5\u20D2im;\uC000\u223C\u20D2\u0180Aan\u2CF0\u2CF4\u2D02rr;\u61D6r\u0100hr\u2CFA\u2CFDk;\u6923\u0100;o\u13E7\u13E5ear;\u6927\u1253\u1A95\0\0\0\0\0\0\0\0\0\0\0\0\0\u2D2D\0\u2D38\u2D48\u2D60\u2D65\u2D72\u2D84\u1B07\0\0\u2D8D\u2DAB\0\u2DC8\u2DCE\0\u2DDC\u2E19\u2E2B\u2E3E\u2E43\u0100cs\u2D31\u1A97ute\u803B\xF3\u40F3\u0100iy\u2D3C\u2D45r\u0100;c\u1A9E\u2D42\u803B\xF4\u40F4;\u443E\u0280abios\u1AA0\u2D52\u2D57\u01C8\u2D5Alac;\u4151v;\u6A38old;\u69BClig;\u4153\u0100cr\u2D69\u2D6Dir;\u69BF;\uC000\u{1D52C}\u036F\u2D79\0\0\u2D7C\0\u2D82n;\u42DBave\u803B\xF2\u40F2;\u69C1\u0100bm\u2D88\u0DF4ar;\u69B5\u0200acit\u2D95\u2D98\u2DA5\u2DA8r\xF2\u1A80\u0100ir\u2D9D\u2DA0r;\u69BEoss;\u69BBn\xE5\u0E52;\u69C0\u0180aei\u2DB1\u2DB5\u2DB9cr;\u414Dga;\u43C9\u0180cdn\u2DC0\u2DC5\u01CDron;\u43BF;\u69B6pf;\uC000\u{1D560}\u0180ael\u2DD4\u2DD7\u01D2r;\u69B7rp;\u69B9\u0380;adiosv\u2DEA\u2DEB\u2DEE\u2E08\u2E0D\u2E10\u2E16\u6228r\xF2\u1A86\u0200;efm\u2DF7\u2DF8\u2E02\u2E05\u6A5Dr\u0100;o\u2DFE\u2DFF\u6134f\xBB\u2DFF\u803B\xAA\u40AA\u803B\xBA\u40BAgof;\u62B6r;\u6A56lope;\u6A57;\u6A5B\u0180clo\u2E1F\u2E21\u2E27\xF2\u2E01ash\u803B\xF8\u40F8l;\u6298i\u016C\u2E2F\u2E34de\u803B\xF5\u40F5es\u0100;a\u01DB\u2E3As;\u6A36ml\u803B\xF6\u40F6bar;\u633D\u0AE1\u2E5E\0\u2E7D\0\u2E80\u2E9D\0\u2EA2\u2EB9\0\0\u2ECB\u0E9C\0\u2F13\0\0\u2F2B\u2FBC\0\u2FC8r\u0200;ast\u0403\u2E67\u2E72\u0E85\u8100\xB6;l\u2E6D\u2E6E\u40B6le\xEC\u0403\u0269\u2E78\0\0\u2E7Bm;\u6AF3;\u6AFDy;\u443Fr\u0280cimpt\u2E8B\u2E8F\u2E93\u1865\u2E97nt;\u4025od;\u402Eil;\u6030enk;\u6031r;\uC000\u{1D52D}\u0180imo\u2EA8\u2EB0\u2EB4\u0100;v\u2EAD\u2EAE\u43C6;\u43D5ma\xF4\u0A76ne;\u660E\u0180;tv\u2EBF\u2EC0\u2EC8\u43C0chfork\xBB\u1FFD;\u43D6\u0100au\u2ECF\u2EDFn\u0100ck\u2ED5\u2EDDk\u0100;h\u21F4\u2EDB;\u610E\xF6\u21F4s\u0480;abcdemst\u2EF3\u2EF4\u1908\u2EF9\u2EFD\u2F04\u2F06\u2F0A\u2F0E\u402Bcir;\u6A23ir;\u6A22\u0100ou\u1D40\u2F02;\u6A25;\u6A72n\u80BB\xB1\u0E9Dim;\u6A26wo;\u6A27\u0180ipu\u2F19\u2F20\u2F25ntint;\u6A15f;\uC000\u{1D561}nd\u803B\xA3\u40A3\u0500;Eaceinosu\u0EC8\u2F3F\u2F41\u2F44\u2F47\u2F81\u2F89\u2F92\u2F7E\u2FB6;\u6AB3p;\u6AB7u\xE5\u0ED9\u0100;c\u0ECE\u2F4C\u0300;acens\u0EC8\u2F59\u2F5F\u2F66\u2F68\u2F7Eppro\xF8\u2F43urlye\xF1\u0ED9\xF1\u0ECE\u0180aes\u2F6F\u2F76\u2F7Approx;\u6AB9qq;\u6AB5im;\u62E8i\xED\u0EDFme\u0100;s\u2F88\u0EAE\u6032\u0180Eas\u2F78\u2F90\u2F7A\xF0\u2F75\u0180dfp\u0EEC\u2F99\u2FAF\u0180als\u2FA0\u2FA5\u2FAAlar;\u632Eine;\u6312urf;\u6313\u0100;t\u0EFB\u2FB4\xEF\u0EFBrel;\u62B0\u0100ci\u2FC0\u2FC5r;\uC000\u{1D4C5};\u43C8ncsp;\u6008\u0300fiopsu\u2FDA\u22E2\u2FDF\u2FE5\u2FEB\u2FF1r;\uC000\u{1D52E}pf;\uC000\u{1D562}rime;\u6057cr;\uC000\u{1D4C6}\u0180aeo\u2FF8\u3009\u3013t\u0100ei\u2FFE\u3005rnion\xF3\u06B0nt;\u6A16st\u0100;e\u3010\u3011\u403F\xF1\u1F19\xF4\u0F14\u0A80ABHabcdefhilmnoprstux\u3040\u3051\u3055\u3059\u30E0\u310E\u312B\u3147\u3162\u3172\u318E\u3206\u3215\u3224\u3229\u3258\u326E\u3272\u3290\u32B0\u32B7\u0180art\u3047\u304A\u304Cr\xF2\u10B3\xF2\u03DDail;\u691Car\xF2\u1C65ar;\u6964\u0380cdenqrt\u3068\u3075\u3078\u307F\u308F\u3094\u30CC\u0100eu\u306D\u3071;\uC000\u223D\u0331te;\u4155i\xE3\u116Emptyv;\u69B3g\u0200;del\u0FD1\u3089\u308B\u308D;\u6992;\u69A5\xE5\u0FD1uo\u803B\xBB\u40BBr\u0580;abcfhlpstw\u0FDC\u30AC\u30AF\u30B7\u30B9\u30BC\u30BE\u30C0\u30C3\u30C7\u30CAp;\u6975\u0100;f\u0FE0\u30B4s;\u6920;\u6933s;\u691E\xEB\u225D\xF0\u272El;\u6945im;\u6974l;\u61A3;\u619D\u0100ai\u30D1\u30D5il;\u691Ao\u0100;n\u30DB\u30DC\u6236al\xF3\u0F1E\u0180abr\u30E7\u30EA\u30EEr\xF2\u17E5rk;\u6773\u0100ak\u30F3\u30FDc\u0100ek\u30F9\u30FB;\u407D;\u405D\u0100es\u3102\u3104;\u698Cl\u0100du\u310A\u310C;\u698E;\u6990\u0200aeuy\u3117\u311C\u3127\u3129ron;\u4159\u0100di\u3121\u3125il;\u4157\xEC\u0FF2\xE2\u30FA;\u4440\u0200clqs\u3134\u3137\u313D\u3144a;\u6937dhar;\u6969uo\u0100;r\u020E\u020Dh;\u61B3\u0180acg\u314E\u315F\u0F44l\u0200;ips\u0F78\u3158\u315B\u109Cn\xE5\u10BBar\xF4\u0FA9t;\u65AD\u0180ilr\u3169\u1023\u316Esht;\u697D;\uC000\u{1D52F}\u0100ao\u3177\u3186r\u0100du\u317D\u317F\xBB\u047B\u0100;l\u1091\u3184;\u696C\u0100;v\u318B\u318C\u43C1;\u43F1\u0180gns\u3195\u31F9\u31FCht\u0300ahlrst\u31A4\u31B0\u31C2\u31D8\u31E4\u31EErrow\u0100;t\u0FDC\u31ADa\xE9\u30C8arpoon\u0100du\u31BB\u31BFow\xEE\u317Ep\xBB\u1092eft\u0100ah\u31CA\u31D0rrow\xF3\u0FEAarpoon\xF3\u0551ightarrows;\u61C9quigarro\xF7\u30CBhreetimes;\u62CCg;\u42DAingdotse\xF1\u1F32\u0180ahm\u320D\u3210\u3213r\xF2\u0FEAa\xF2\u0551;\u600Foust\u0100;a\u321E\u321F\u63B1che\xBB\u321Fmid;\u6AEE\u0200abpt\u3232\u323D\u3240\u3252\u0100nr\u3237\u323Ag;\u67EDr;\u61FEr\xEB\u1003\u0180afl\u3247\u324A\u324Er;\u6986;\uC000\u{1D563}us;\u6A2Eimes;\u6A35\u0100ap\u325D\u3267r\u0100;g\u3263\u3264\u4029t;\u6994olint;\u6A12ar\xF2\u31E3\u0200achq\u327B\u3280\u10BC\u3285quo;\u603Ar;\uC000\u{1D4C7}\u0100bu\u30FB\u328Ao\u0100;r\u0214\u0213\u0180hir\u3297\u329B\u32A0re\xE5\u31F8mes;\u62CAi\u0200;efl\u32AA\u1059\u1821\u32AB\u65B9tri;\u69CEluhar;\u6968;\u611E\u0D61\u32D5\u32DB\u32DF\u332C\u3338\u3371\0\u337A\u33A4\0\0\u33EC\u33F0\0\u3428\u3448\u345A\u34AD\u34B1\u34CA\u34F1\0\u3616\0\0\u3633cute;\u415Bqu\xEF\u27BA\u0500;Eaceinpsy\u11ED\u32F3\u32F5\u32FF\u3302\u330B\u330F\u331F\u3326\u3329;\u6AB4\u01F0\u32FA\0\u32FC;\u6AB8on;\u4161u\xE5\u11FE\u0100;d\u11F3\u3307il;\u415Frc;\u415D\u0180Eas\u3316\u3318\u331B;\u6AB6p;\u6ABAim;\u62E9olint;\u6A13i\xED\u1204;\u4441ot\u0180;be\u3334\u1D47\u3335\u62C5;\u6A66\u0380Aacmstx\u3346\u334A\u3357\u335B\u335E\u3363\u336Drr;\u61D8r\u0100hr\u3350\u3352\xEB\u2228\u0100;o\u0A36\u0A34t\u803B\xA7\u40A7i;\u403Bwar;\u6929m\u0100in\u3369\xF0nu\xF3\xF1t;\u6736r\u0100;o\u3376\u2055\uC000\u{1D530}\u0200acoy\u3382\u3386\u3391\u33A0rp;\u666F\u0100hy\u338B\u338Fcy;\u4449;\u4448rt\u026D\u3399\0\0\u339Ci\xE4\u1464ara\xEC\u2E6F\u803B\xAD\u40AD\u0100gm\u33A8\u33B4ma\u0180;fv\u33B1\u33B2\u33B2\u43C3;\u43C2\u0400;deglnpr\u12AB\u33C5\u33C9\u33CE\u33D6\u33DE\u33E1\u33E6ot;\u6A6A\u0100;q\u12B1\u12B0\u0100;E\u33D3\u33D4\u6A9E;\u6AA0\u0100;E\u33DB\u33DC\u6A9D;\u6A9Fe;\u6246lus;\u6A24arr;\u6972ar\xF2\u113D\u0200aeit\u33F8\u3408\u340F\u3417\u0100ls\u33FD\u3404lsetm\xE9\u336Ahp;\u6A33parsl;\u69E4\u0100dl\u1463\u3414e;\u6323\u0100;e\u341C\u341D\u6AAA\u0100;s\u3422\u3423\u6AAC;\uC000\u2AAC\uFE00\u0180flp\u342E\u3433\u3442tcy;\u444C\u0100;b\u3438\u3439\u402F\u0100;a\u343E\u343F\u69C4r;\u633Ff;\uC000\u{1D564}a\u0100dr\u344D\u0402es\u0100;u\u3454\u3455\u6660it\xBB\u3455\u0180csu\u3460\u3479\u349F\u0100au\u3465\u346Fp\u0100;s\u1188\u346B;\uC000\u2293\uFE00p\u0100;s\u11B4\u3475;\uC000\u2294\uFE00u\u0100bp\u347F\u348F\u0180;es\u1197\u119C\u3486et\u0100;e\u1197\u348D\xF1\u119D\u0180;es\u11A8\u11AD\u3496et\u0100;e\u11A8\u349D\xF1\u11AE\u0180;af\u117B\u34A6\u05B0r\u0165\u34AB\u05B1\xBB\u117Car\xF2\u1148\u0200cemt\u34B9\u34BE\u34C2\u34C5r;\uC000\u{1D4C8}tm\xEE\xF1i\xEC\u3415ar\xE6\u11BE\u0100ar\u34CE\u34D5r\u0100;f\u34D4\u17BF\u6606\u0100an\u34DA\u34EDight\u0100ep\u34E3\u34EApsilo\xEE\u1EE0h\xE9\u2EAFs\xBB\u2852\u0280bcmnp\u34FB\u355E\u1209\u358B\u358E\u0480;Edemnprs\u350E\u350F\u3511\u3515\u351E\u3523\u352C\u3531\u3536\u6282;\u6AC5ot;\u6ABD\u0100;d\u11DA\u351Aot;\u6AC3ult;\u6AC1\u0100Ee\u3528\u352A;\u6ACB;\u628Alus;\u6ABFarr;\u6979\u0180eiu\u353D\u3552\u3555t\u0180;en\u350E\u3545\u354Bq\u0100;q\u11DA\u350Feq\u0100;q\u352B\u3528m;\u6AC7\u0100bp\u355A\u355C;\u6AD5;\u6AD3c\u0300;acens\u11ED\u356C\u3572\u3579\u357B\u3326ppro\xF8\u32FAurlye\xF1\u11FE\xF1\u11F3\u0180aes\u3582\u3588\u331Bppro\xF8\u331Aq\xF1\u3317g;\u666A\u0680123;Edehlmnps\u35A9\u35AC\u35AF\u121C\u35B2\u35B4\u35C0\u35C9\u35D5\u35DA\u35DF\u35E8\u35ED\u803B\xB9\u40B9\u803B\xB2\u40B2\u803B\xB3\u40B3;\u6AC6\u0100os\u35B9\u35BCt;\u6ABEub;\u6AD8\u0100;d\u1222\u35C5ot;\u6AC4s\u0100ou\u35CF\u35D2l;\u67C9b;\u6AD7arr;\u697Bult;\u6AC2\u0100Ee\u35E4\u35E6;\u6ACC;\u628Blus;\u6AC0\u0180eiu\u35F4\u3609\u360Ct\u0180;en\u121C\u35FC\u3602q\u0100;q\u1222\u35B2eq\u0100;q\u35E7\u35E4m;\u6AC8\u0100bp\u3611\u3613;\u6AD4;\u6AD6\u0180Aan\u361C\u3620\u362Drr;\u61D9r\u0100hr\u3626\u3628\xEB\u222E\u0100;o\u0A2B\u0A29war;\u692Alig\u803B\xDF\u40DF\u0BE1\u3651\u365D\u3660\u12CE\u3673\u3679\0\u367E\u36C2\0\0\0\0\0\u36DB\u3703\0\u3709\u376C\0\0\0\u3787\u0272\u3656\0\0\u365Bget;\u6316;\u43C4r\xEB\u0E5F\u0180aey\u3666\u366B\u3670ron;\u4165dil;\u4163;\u4442lrec;\u6315r;\uC000\u{1D531}\u0200eiko\u3686\u369D\u36B5\u36BC\u01F2\u368B\0\u3691e\u01004f\u1284\u1281a\u0180;sv\u3698\u3699\u369B\u43B8ym;\u43D1\u0100cn\u36A2\u36B2k\u0100as\u36A8\u36AEppro\xF8\u12C1im\xBB\u12ACs\xF0\u129E\u0100as\u36BA\u36AE\xF0\u12C1rn\u803B\xFE\u40FE\u01EC\u031F\u36C6\u22E7es\u8180\xD7;bd\u36CF\u36D0\u36D8\u40D7\u0100;a\u190F\u36D5r;\u6A31;\u6A30\u0180eps\u36E1\u36E3\u3700\xE1\u2A4D\u0200;bcf\u0486\u36EC\u36F0\u36F4ot;\u6336ir;\u6AF1\u0100;o\u36F9\u36FC\uC000\u{1D565}rk;\u6ADA\xE1\u3362rime;\u6034\u0180aip\u370F\u3712\u3764d\xE5\u1248\u0380adempst\u3721\u374D\u3740\u3751\u3757\u375C\u375Fngle\u0280;dlqr\u3730\u3731\u3736\u3740\u3742\u65B5own\xBB\u1DBBeft\u0100;e\u2800\u373E\xF1\u092E;\u625Cight\u0100;e\u32AA\u374B\xF1\u105Aot;\u65ECinus;\u6A3Alus;\u6A39b;\u69CDime;\u6A3Bezium;\u63E2\u0180cht\u3772\u377D\u3781\u0100ry\u3777\u377B;\uC000\u{1D4C9};\u4446cy;\u445Brok;\u4167\u0100io\u378B\u378Ex\xF4\u1777head\u0100lr\u3797\u37A0eftarro\xF7\u084Fightarrow\xBB\u0F5D\u0900AHabcdfghlmoprstuw\u37D0\u37D3\u37D7\u37E4\u37F0\u37FC\u380E\u381C\u3823\u3834\u3851\u385D\u386B\u38A9\u38CC\u38D2\u38EA\u38F6r\xF2\u03EDar;\u6963\u0100cr\u37DC\u37E2ute\u803B\xFA\u40FA\xF2\u1150r\u01E3\u37EA\0\u37EDy;\u445Eve;\u416D\u0100iy\u37F5\u37FArc\u803B\xFB\u40FB;\u4443\u0180abh\u3803\u3806\u380Br\xF2\u13ADlac;\u4171a\xF2\u13C3\u0100ir\u3813\u3818sht;\u697E;\uC000\u{1D532}rave\u803B\xF9\u40F9\u0161\u3827\u3831r\u0100lr\u382C\u382E\xBB\u0957\xBB\u1083lk;\u6580\u0100ct\u3839\u384D\u026F\u383F\0\0\u384Arn\u0100;e\u3845\u3846\u631Cr\xBB\u3846op;\u630Fri;\u65F8\u0100al\u3856\u385Acr;\u416B\u80BB\xA8\u0349\u0100gp\u3862\u3866on;\u4173f;\uC000\u{1D566}\u0300adhlsu\u114B\u3878\u387D\u1372\u3891\u38A0own\xE1\u13B3arpoon\u0100lr\u3888\u388Cef\xF4\u382Digh\xF4\u382Fi\u0180;hl\u3899\u389A\u389C\u43C5\xBB\u13FAon\xBB\u389Aparrows;\u61C8\u0180cit\u38B0\u38C4\u38C8\u026F\u38B6\0\0\u38C1rn\u0100;e\u38BC\u38BD\u631Dr\xBB\u38BDop;\u630Eng;\u416Fri;\u65F9cr;\uC000\u{1D4CA}\u0180dir\u38D9\u38DD\u38E2ot;\u62F0lde;\u4169i\u0100;f\u3730\u38E8\xBB\u1813\u0100am\u38EF\u38F2r\xF2\u38A8l\u803B\xFC\u40FCangle;\u69A7\u0780ABDacdeflnoprsz\u391C\u391F\u3929\u392D\u39B5\u39B8\u39BD\u39DF\u39E4\u39E8\u39F3\u39F9\u39FD\u3A01\u3A20r\xF2\u03F7ar\u0100;v\u3926\u3927\u6AE8;\u6AE9as\xE8\u03E1\u0100nr\u3932\u3937grt;\u699C\u0380eknprst\u34E3\u3946\u394B\u3952\u395D\u3964\u3996app\xE1\u2415othin\xE7\u1E96\u0180hir\u34EB\u2EC8\u3959op\xF4\u2FB5\u0100;h\u13B7\u3962\xEF\u318D\u0100iu\u3969\u396Dgm\xE1\u33B3\u0100bp\u3972\u3984setneq\u0100;q\u397D\u3980\uC000\u228A\uFE00;\uC000\u2ACB\uFE00setneq\u0100;q\u398F\u3992\uC000\u228B\uFE00;\uC000\u2ACC\uFE00\u0100hr\u399B\u399Fet\xE1\u369Ciangle\u0100lr\u39AA\u39AFeft\xBB\u0925ight\xBB\u1051y;\u4432ash\xBB\u1036\u0180elr\u39C4\u39D2\u39D7\u0180;be\u2DEA\u39CB\u39CFar;\u62BBq;\u625Alip;\u62EE\u0100bt\u39DC\u1468a\xF2\u1469r;\uC000\u{1D533}tr\xE9\u39AEsu\u0100bp\u39EF\u39F1\xBB\u0D1C\xBB\u0D59pf;\uC000\u{1D567}ro\xF0\u0EFBtr\xE9\u39B4\u0100cu\u3A06\u3A0Br;\uC000\u{1D4CB}\u0100bp\u3A10\u3A18n\u0100Ee\u3980\u3A16\xBB\u397En\u0100Ee\u3992\u3A1E\xBB\u3990igzag;\u699A\u0380cefoprs\u3A36\u3A3B\u3A56\u3A5B\u3A54\u3A61\u3A6Airc;\u4175\u0100di\u3A40\u3A51\u0100bg\u3A45\u3A49ar;\u6A5Fe\u0100;q\u15FA\u3A4F;\u6259erp;\u6118r;\uC000\u{1D534}pf;\uC000\u{1D568}\u0100;e\u1479\u3A66at\xE8\u1479cr;\uC000\u{1D4CC}\u0AE3\u178E\u3A87\0\u3A8B\0\u3A90\u3A9B\0\0\u3A9D\u3AA8\u3AAB\u3AAF\0\0\u3AC3\u3ACE\0\u3AD8\u17DC\u17DFtr\xE9\u17D1r;\uC000\u{1D535}\u0100Aa\u3A94\u3A97r\xF2\u03C3r\xF2\u09F6;\u43BE\u0100Aa\u3AA1\u3AA4r\xF2\u03B8r\xF2\u09EBa\xF0\u2713is;\u62FB\u0180dpt\u17A4\u3AB5\u3ABE\u0100fl\u3ABA\u17A9;\uC000\u{1D569}im\xE5\u17B2\u0100Aa\u3AC7\u3ACAr\xF2\u03CEr\xF2\u0A01\u0100cq\u3AD2\u17B8r;\uC000\u{1D4CD}\u0100pt\u17D6\u3ADCr\xE9\u17D4\u0400acefiosu\u3AF0\u3AFD\u3B08\u3B0C\u3B11\u3B15\u3B1B\u3B21c\u0100uy\u3AF6\u3AFBte\u803B\xFD\u40FD;\u444F\u0100iy\u3B02\u3B06rc;\u4177;\u444Bn\u803B\xA5\u40A5r;\uC000\u{1D536}cy;\u4457pf;\uC000\u{1D56A}cr;\uC000\u{1D4CE}\u0100cm\u3B26\u3B29y;\u444El\u803B\xFF\u40FF\u0500acdefhiosw\u3B42\u3B48\u3B54\u3B58\u3B64\u3B69\u3B6D\u3B74\u3B7A\u3B80cute;\u417A\u0100ay\u3B4D\u3B52ron;\u417E;\u4437ot;\u417C\u0100et\u3B5D\u3B61tr\xE6\u155Fa;\u43B6r;\uC000\u{1D537}cy;\u4436grarr;\u61DDpf;\uC000\u{1D56B}cr;\uC000\u{1D4CF}\u0100jn\u3B85\u3B87;\u600Dj;\u600C'.split("").map(function(c) {
        return c.charCodeAt(0);
      })
    );
  }
});

// node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/generated/decode-data-xml.js
var require_decode_data_xml = __commonJS({
  "node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/generated/decode-data-xml.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = new Uint16Array(
      // prettier-ignore
      "\u0200aglq	\x1B\u026D\0\0p;\u4026os;\u4027t;\u403Et;\u403Cuot;\u4022".split("").map(function(c) {
        return c.charCodeAt(0);
      })
    );
  }
});

// node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/decode_codepoint.js
var require_decode_codepoint = __commonJS({
  "node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/decode_codepoint.js"(exports2) {
    "use strict";
    var _a;
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.replaceCodePoint = exports2.fromCodePoint = void 0;
    var decodeMap = /* @__PURE__ */ new Map([
      [0, 65533],
      // C1 Unicode control character reference replacements
      [128, 8364],
      [130, 8218],
      [131, 402],
      [132, 8222],
      [133, 8230],
      [134, 8224],
      [135, 8225],
      [136, 710],
      [137, 8240],
      [138, 352],
      [139, 8249],
      [140, 338],
      [142, 381],
      [145, 8216],
      [146, 8217],
      [147, 8220],
      [148, 8221],
      [149, 8226],
      [150, 8211],
      [151, 8212],
      [152, 732],
      [153, 8482],
      [154, 353],
      [155, 8250],
      [156, 339],
      [158, 382],
      [159, 376]
    ]);
    exports2.fromCodePoint = // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, node/no-unsupported-features/es-builtins
    (_a = String.fromCodePoint) !== null && _a !== void 0 ? _a : function(codePoint) {
      var output = "";
      if (codePoint > 65535) {
        codePoint -= 65536;
        output += String.fromCharCode(codePoint >>> 10 & 1023 | 55296);
        codePoint = 56320 | codePoint & 1023;
      }
      output += String.fromCharCode(codePoint);
      return output;
    };
    function replaceCodePoint(codePoint) {
      var _a2;
      if (codePoint >= 55296 && codePoint <= 57343 || codePoint > 1114111) {
        return 65533;
      }
      return (_a2 = decodeMap.get(codePoint)) !== null && _a2 !== void 0 ? _a2 : codePoint;
    }
    exports2.replaceCodePoint = replaceCodePoint;
    function decodeCodePoint(codePoint) {
      return (0, exports2.fromCodePoint)(replaceCodePoint(codePoint));
    }
    exports2.default = decodeCodePoint;
  }
});

// node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/decode.js
var require_decode = __commonJS({
  "node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/decode.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.decodeXML = exports2.decodeHTMLStrict = exports2.decodeHTMLAttribute = exports2.decodeHTML = exports2.determineBranch = exports2.EntityDecoder = exports2.DecodingMode = exports2.BinTrieFlags = exports2.fromCodePoint = exports2.replaceCodePoint = exports2.decodeCodePoint = exports2.xmlDecodeTree = exports2.htmlDecodeTree = void 0;
    var decode_data_html_js_1 = __importDefault(require_decode_data_html());
    exports2.htmlDecodeTree = decode_data_html_js_1.default;
    var decode_data_xml_js_1 = __importDefault(require_decode_data_xml());
    exports2.xmlDecodeTree = decode_data_xml_js_1.default;
    var decode_codepoint_js_1 = __importStar(require_decode_codepoint());
    exports2.decodeCodePoint = decode_codepoint_js_1.default;
    var decode_codepoint_js_2 = require_decode_codepoint();
    Object.defineProperty(exports2, "replaceCodePoint", { enumerable: true, get: function() {
      return decode_codepoint_js_2.replaceCodePoint;
    } });
    Object.defineProperty(exports2, "fromCodePoint", { enumerable: true, get: function() {
      return decode_codepoint_js_2.fromCodePoint;
    } });
    var CharCodes;
    (function(CharCodes2) {
      CharCodes2[CharCodes2["NUM"] = 35] = "NUM";
      CharCodes2[CharCodes2["SEMI"] = 59] = "SEMI";
      CharCodes2[CharCodes2["EQUALS"] = 61] = "EQUALS";
      CharCodes2[CharCodes2["ZERO"] = 48] = "ZERO";
      CharCodes2[CharCodes2["NINE"] = 57] = "NINE";
      CharCodes2[CharCodes2["LOWER_A"] = 97] = "LOWER_A";
      CharCodes2[CharCodes2["LOWER_F"] = 102] = "LOWER_F";
      CharCodes2[CharCodes2["LOWER_X"] = 120] = "LOWER_X";
      CharCodes2[CharCodes2["LOWER_Z"] = 122] = "LOWER_Z";
      CharCodes2[CharCodes2["UPPER_A"] = 65] = "UPPER_A";
      CharCodes2[CharCodes2["UPPER_F"] = 70] = "UPPER_F";
      CharCodes2[CharCodes2["UPPER_Z"] = 90] = "UPPER_Z";
    })(CharCodes || (CharCodes = {}));
    var TO_LOWER_BIT = 32;
    var BinTrieFlags;
    (function(BinTrieFlags2) {
      BinTrieFlags2[BinTrieFlags2["VALUE_LENGTH"] = 49152] = "VALUE_LENGTH";
      BinTrieFlags2[BinTrieFlags2["BRANCH_LENGTH"] = 16256] = "BRANCH_LENGTH";
      BinTrieFlags2[BinTrieFlags2["JUMP_TABLE"] = 127] = "JUMP_TABLE";
    })(BinTrieFlags = exports2.BinTrieFlags || (exports2.BinTrieFlags = {}));
    function isNumber(code) {
      return code >= CharCodes.ZERO && code <= CharCodes.NINE;
    }
    function isHexadecimalCharacter(code) {
      return code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_F || code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_F;
    }
    function isAsciiAlphaNumeric(code) {
      return code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_Z || code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_Z || isNumber(code);
    }
    function isEntityInAttributeInvalidEnd(code) {
      return code === CharCodes.EQUALS || isAsciiAlphaNumeric(code);
    }
    var EntityDecoderState;
    (function(EntityDecoderState2) {
      EntityDecoderState2[EntityDecoderState2["EntityStart"] = 0] = "EntityStart";
      EntityDecoderState2[EntityDecoderState2["NumericStart"] = 1] = "NumericStart";
      EntityDecoderState2[EntityDecoderState2["NumericDecimal"] = 2] = "NumericDecimal";
      EntityDecoderState2[EntityDecoderState2["NumericHex"] = 3] = "NumericHex";
      EntityDecoderState2[EntityDecoderState2["NamedEntity"] = 4] = "NamedEntity";
    })(EntityDecoderState || (EntityDecoderState = {}));
    var DecodingMode;
    (function(DecodingMode2) {
      DecodingMode2[DecodingMode2["Legacy"] = 0] = "Legacy";
      DecodingMode2[DecodingMode2["Strict"] = 1] = "Strict";
      DecodingMode2[DecodingMode2["Attribute"] = 2] = "Attribute";
    })(DecodingMode = exports2.DecodingMode || (exports2.DecodingMode = {}));
    var EntityDecoder = (
      /** @class */
      function() {
        function EntityDecoder2(decodeTree, emitCodePoint, errors) {
          this.decodeTree = decodeTree;
          this.emitCodePoint = emitCodePoint;
          this.errors = errors;
          this.state = EntityDecoderState.EntityStart;
          this.consumed = 1;
          this.result = 0;
          this.treeIndex = 0;
          this.excess = 1;
          this.decodeMode = DecodingMode.Strict;
        }
        EntityDecoder2.prototype.startEntity = function(decodeMode) {
          this.decodeMode = decodeMode;
          this.state = EntityDecoderState.EntityStart;
          this.result = 0;
          this.treeIndex = 0;
          this.excess = 1;
          this.consumed = 1;
        };
        EntityDecoder2.prototype.write = function(str, offset) {
          switch (this.state) {
            case EntityDecoderState.EntityStart: {
              if (str.charCodeAt(offset) === CharCodes.NUM) {
                this.state = EntityDecoderState.NumericStart;
                this.consumed += 1;
                return this.stateNumericStart(str, offset + 1);
              }
              this.state = EntityDecoderState.NamedEntity;
              return this.stateNamedEntity(str, offset);
            }
            case EntityDecoderState.NumericStart: {
              return this.stateNumericStart(str, offset);
            }
            case EntityDecoderState.NumericDecimal: {
              return this.stateNumericDecimal(str, offset);
            }
            case EntityDecoderState.NumericHex: {
              return this.stateNumericHex(str, offset);
            }
            case EntityDecoderState.NamedEntity: {
              return this.stateNamedEntity(str, offset);
            }
          }
        };
        EntityDecoder2.prototype.stateNumericStart = function(str, offset) {
          if (offset >= str.length) {
            return -1;
          }
          if ((str.charCodeAt(offset) | TO_LOWER_BIT) === CharCodes.LOWER_X) {
            this.state = EntityDecoderState.NumericHex;
            this.consumed += 1;
            return this.stateNumericHex(str, offset + 1);
          }
          this.state = EntityDecoderState.NumericDecimal;
          return this.stateNumericDecimal(str, offset);
        };
        EntityDecoder2.prototype.addToNumericResult = function(str, start, end, base) {
          if (start !== end) {
            var digitCount = end - start;
            this.result = this.result * Math.pow(base, digitCount) + parseInt(str.substr(start, digitCount), base);
            this.consumed += digitCount;
          }
        };
        EntityDecoder2.prototype.stateNumericHex = function(str, offset) {
          var startIdx = offset;
          while (offset < str.length) {
            var char = str.charCodeAt(offset);
            if (isNumber(char) || isHexadecimalCharacter(char)) {
              offset += 1;
            } else {
              this.addToNumericResult(str, startIdx, offset, 16);
              return this.emitNumericEntity(char, 3);
            }
          }
          this.addToNumericResult(str, startIdx, offset, 16);
          return -1;
        };
        EntityDecoder2.prototype.stateNumericDecimal = function(str, offset) {
          var startIdx = offset;
          while (offset < str.length) {
            var char = str.charCodeAt(offset);
            if (isNumber(char)) {
              offset += 1;
            } else {
              this.addToNumericResult(str, startIdx, offset, 10);
              return this.emitNumericEntity(char, 2);
            }
          }
          this.addToNumericResult(str, startIdx, offset, 10);
          return -1;
        };
        EntityDecoder2.prototype.emitNumericEntity = function(lastCp, expectedLength) {
          var _a;
          if (this.consumed <= expectedLength) {
            (_a = this.errors) === null || _a === void 0 ? void 0 : _a.absenceOfDigitsInNumericCharacterReference(this.consumed);
            return 0;
          }
          if (lastCp === CharCodes.SEMI) {
            this.consumed += 1;
          } else if (this.decodeMode === DecodingMode.Strict) {
            return 0;
          }
          this.emitCodePoint((0, decode_codepoint_js_1.replaceCodePoint)(this.result), this.consumed);
          if (this.errors) {
            if (lastCp !== CharCodes.SEMI) {
              this.errors.missingSemicolonAfterCharacterReference();
            }
            this.errors.validateNumericCharacterReference(this.result);
          }
          return this.consumed;
        };
        EntityDecoder2.prototype.stateNamedEntity = function(str, offset) {
          var decodeTree = this.decodeTree;
          var current = decodeTree[this.treeIndex];
          var valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
          for (; offset < str.length; offset++, this.excess++) {
            var char = str.charCodeAt(offset);
            this.treeIndex = determineBranch(decodeTree, current, this.treeIndex + Math.max(1, valueLength), char);
            if (this.treeIndex < 0) {
              return this.result === 0 || // If we are parsing an attribute
              this.decodeMode === DecodingMode.Attribute && // We shouldn't have consumed any characters after the entity,
              (valueLength === 0 || // And there should be no invalid characters.
              isEntityInAttributeInvalidEnd(char)) ? 0 : this.emitNotTerminatedNamedEntity();
            }
            current = decodeTree[this.treeIndex];
            valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
            if (valueLength !== 0) {
              if (char === CharCodes.SEMI) {
                return this.emitNamedEntityData(this.treeIndex, valueLength, this.consumed + this.excess);
              }
              if (this.decodeMode !== DecodingMode.Strict) {
                this.result = this.treeIndex;
                this.consumed += this.excess;
                this.excess = 0;
              }
            }
          }
          return -1;
        };
        EntityDecoder2.prototype.emitNotTerminatedNamedEntity = function() {
          var _a;
          var _b = this, result = _b.result, decodeTree = _b.decodeTree;
          var valueLength = (decodeTree[result] & BinTrieFlags.VALUE_LENGTH) >> 14;
          this.emitNamedEntityData(result, valueLength, this.consumed);
          (_a = this.errors) === null || _a === void 0 ? void 0 : _a.missingSemicolonAfterCharacterReference();
          return this.consumed;
        };
        EntityDecoder2.prototype.emitNamedEntityData = function(result, valueLength, consumed) {
          var decodeTree = this.decodeTree;
          this.emitCodePoint(valueLength === 1 ? decodeTree[result] & ~BinTrieFlags.VALUE_LENGTH : decodeTree[result + 1], consumed);
          if (valueLength === 3) {
            this.emitCodePoint(decodeTree[result + 2], consumed);
          }
          return consumed;
        };
        EntityDecoder2.prototype.end = function() {
          var _a;
          switch (this.state) {
            case EntityDecoderState.NamedEntity: {
              return this.result !== 0 && (this.decodeMode !== DecodingMode.Attribute || this.result === this.treeIndex) ? this.emitNotTerminatedNamedEntity() : 0;
            }
            // Otherwise, emit a numeric entity if we have one.
            case EntityDecoderState.NumericDecimal: {
              return this.emitNumericEntity(0, 2);
            }
            case EntityDecoderState.NumericHex: {
              return this.emitNumericEntity(0, 3);
            }
            case EntityDecoderState.NumericStart: {
              (_a = this.errors) === null || _a === void 0 ? void 0 : _a.absenceOfDigitsInNumericCharacterReference(this.consumed);
              return 0;
            }
            case EntityDecoderState.EntityStart: {
              return 0;
            }
          }
        };
        return EntityDecoder2;
      }()
    );
    exports2.EntityDecoder = EntityDecoder;
    function getDecoder(decodeTree) {
      var ret = "";
      var decoder = new EntityDecoder(decodeTree, function(str) {
        return ret += (0, decode_codepoint_js_1.fromCodePoint)(str);
      });
      return function decodeWithTrie(str, decodeMode) {
        var lastIndex = 0;
        var offset = 0;
        while ((offset = str.indexOf("&", offset)) >= 0) {
          ret += str.slice(lastIndex, offset);
          decoder.startEntity(decodeMode);
          var len = decoder.write(
            str,
            // Skip the "&"
            offset + 1
          );
          if (len < 0) {
            lastIndex = offset + decoder.end();
            break;
          }
          lastIndex = offset + len;
          offset = len === 0 ? lastIndex + 1 : lastIndex;
        }
        var result = ret + str.slice(lastIndex);
        ret = "";
        return result;
      };
    }
    function determineBranch(decodeTree, current, nodeIdx, char) {
      var branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
      var jumpOffset = current & BinTrieFlags.JUMP_TABLE;
      if (branchCount === 0) {
        return jumpOffset !== 0 && char === jumpOffset ? nodeIdx : -1;
      }
      if (jumpOffset) {
        var value = char - jumpOffset;
        return value < 0 || value >= branchCount ? -1 : decodeTree[nodeIdx + value] - 1;
      }
      var lo = nodeIdx;
      var hi = lo + branchCount - 1;
      while (lo <= hi) {
        var mid = lo + hi >>> 1;
        var midVal = decodeTree[mid];
        if (midVal < char) {
          lo = mid + 1;
        } else if (midVal > char) {
          hi = mid - 1;
        } else {
          return decodeTree[mid + branchCount];
        }
      }
      return -1;
    }
    exports2.determineBranch = determineBranch;
    var htmlDecoder = getDecoder(decode_data_html_js_1.default);
    var xmlDecoder = getDecoder(decode_data_xml_js_1.default);
    function decodeHTML(str, mode) {
      if (mode === void 0) {
        mode = DecodingMode.Legacy;
      }
      return htmlDecoder(str, mode);
    }
    exports2.decodeHTML = decodeHTML;
    function decodeHTMLAttribute(str) {
      return htmlDecoder(str, DecodingMode.Attribute);
    }
    exports2.decodeHTMLAttribute = decodeHTMLAttribute;
    function decodeHTMLStrict(str) {
      return htmlDecoder(str, DecodingMode.Strict);
    }
    exports2.decodeHTMLStrict = decodeHTMLStrict;
    function decodeXML(str) {
      return xmlDecoder(str, DecodingMode.Strict);
    }
    exports2.decodeXML = decodeXML;
  }
});

// node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/generated/encode-html.js
var require_encode_html = __commonJS({
  "node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/generated/encode-html.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    function restoreDiff(arr) {
      for (var i = 1; i < arr.length; i++) {
        arr[i][0] += arr[i - 1][0] + 1;
      }
      return arr;
    }
    exports2.default = new Map(/* @__PURE__ */ restoreDiff([[9, "&Tab;"], [0, "&NewLine;"], [22, "&excl;"], [0, "&quot;"], [0, "&num;"], [0, "&dollar;"], [0, "&percnt;"], [0, "&amp;"], [0, "&apos;"], [0, "&lpar;"], [0, "&rpar;"], [0, "&ast;"], [0, "&plus;"], [0, "&comma;"], [1, "&period;"], [0, "&sol;"], [10, "&colon;"], [0, "&semi;"], [0, { v: "&lt;", n: 8402, o: "&nvlt;" }], [0, { v: "&equals;", n: 8421, o: "&bne;" }], [0, { v: "&gt;", n: 8402, o: "&nvgt;" }], [0, "&quest;"], [0, "&commat;"], [26, "&lbrack;"], [0, "&bsol;"], [0, "&rbrack;"], [0, "&Hat;"], [0, "&lowbar;"], [0, "&DiacriticalGrave;"], [5, { n: 106, o: "&fjlig;" }], [20, "&lbrace;"], [0, "&verbar;"], [0, "&rbrace;"], [34, "&nbsp;"], [0, "&iexcl;"], [0, "&cent;"], [0, "&pound;"], [0, "&curren;"], [0, "&yen;"], [0, "&brvbar;"], [0, "&sect;"], [0, "&die;"], [0, "&copy;"], [0, "&ordf;"], [0, "&laquo;"], [0, "&not;"], [0, "&shy;"], [0, "&circledR;"], [0, "&macr;"], [0, "&deg;"], [0, "&PlusMinus;"], [0, "&sup2;"], [0, "&sup3;"], [0, "&acute;"], [0, "&micro;"], [0, "&para;"], [0, "&centerdot;"], [0, "&cedil;"], [0, "&sup1;"], [0, "&ordm;"], [0, "&raquo;"], [0, "&frac14;"], [0, "&frac12;"], [0, "&frac34;"], [0, "&iquest;"], [0, "&Agrave;"], [0, "&Aacute;"], [0, "&Acirc;"], [0, "&Atilde;"], [0, "&Auml;"], [0, "&angst;"], [0, "&AElig;"], [0, "&Ccedil;"], [0, "&Egrave;"], [0, "&Eacute;"], [0, "&Ecirc;"], [0, "&Euml;"], [0, "&Igrave;"], [0, "&Iacute;"], [0, "&Icirc;"], [0, "&Iuml;"], [0, "&ETH;"], [0, "&Ntilde;"], [0, "&Ograve;"], [0, "&Oacute;"], [0, "&Ocirc;"], [0, "&Otilde;"], [0, "&Ouml;"], [0, "&times;"], [0, "&Oslash;"], [0, "&Ugrave;"], [0, "&Uacute;"], [0, "&Ucirc;"], [0, "&Uuml;"], [0, "&Yacute;"], [0, "&THORN;"], [0, "&szlig;"], [0, "&agrave;"], [0, "&aacute;"], [0, "&acirc;"], [0, "&atilde;"], [0, "&auml;"], [0, "&aring;"], [0, "&aelig;"], [0, "&ccedil;"], [0, "&egrave;"], [0, "&eacute;"], [0, "&ecirc;"], [0, "&euml;"], [0, "&igrave;"], [0, "&iacute;"], [0, "&icirc;"], [0, "&iuml;"], [0, "&eth;"], [0, "&ntilde;"], [0, "&ograve;"], [0, "&oacute;"], [0, "&ocirc;"], [0, "&otilde;"], [0, "&ouml;"], [0, "&div;"], [0, "&oslash;"], [0, "&ugrave;"], [0, "&uacute;"], [0, "&ucirc;"], [0, "&uuml;"], [0, "&yacute;"], [0, "&thorn;"], [0, "&yuml;"], [0, "&Amacr;"], [0, "&amacr;"], [0, "&Abreve;"], [0, "&abreve;"], [0, "&Aogon;"], [0, "&aogon;"], [0, "&Cacute;"], [0, "&cacute;"], [0, "&Ccirc;"], [0, "&ccirc;"], [0, "&Cdot;"], [0, "&cdot;"], [0, "&Ccaron;"], [0, "&ccaron;"], [0, "&Dcaron;"], [0, "&dcaron;"], [0, "&Dstrok;"], [0, "&dstrok;"], [0, "&Emacr;"], [0, "&emacr;"], [2, "&Edot;"], [0, "&edot;"], [0, "&Eogon;"], [0, "&eogon;"], [0, "&Ecaron;"], [0, "&ecaron;"], [0, "&Gcirc;"], [0, "&gcirc;"], [0, "&Gbreve;"], [0, "&gbreve;"], [0, "&Gdot;"], [0, "&gdot;"], [0, "&Gcedil;"], [1, "&Hcirc;"], [0, "&hcirc;"], [0, "&Hstrok;"], [0, "&hstrok;"], [0, "&Itilde;"], [0, "&itilde;"], [0, "&Imacr;"], [0, "&imacr;"], [2, "&Iogon;"], [0, "&iogon;"], [0, "&Idot;"], [0, "&imath;"], [0, "&IJlig;"], [0, "&ijlig;"], [0, "&Jcirc;"], [0, "&jcirc;"], [0, "&Kcedil;"], [0, "&kcedil;"], [0, "&kgreen;"], [0, "&Lacute;"], [0, "&lacute;"], [0, "&Lcedil;"], [0, "&lcedil;"], [0, "&Lcaron;"], [0, "&lcaron;"], [0, "&Lmidot;"], [0, "&lmidot;"], [0, "&Lstrok;"], [0, "&lstrok;"], [0, "&Nacute;"], [0, "&nacute;"], [0, "&Ncedil;"], [0, "&ncedil;"], [0, "&Ncaron;"], [0, "&ncaron;"], [0, "&napos;"], [0, "&ENG;"], [0, "&eng;"], [0, "&Omacr;"], [0, "&omacr;"], [2, "&Odblac;"], [0, "&odblac;"], [0, "&OElig;"], [0, "&oelig;"], [0, "&Racute;"], [0, "&racute;"], [0, "&Rcedil;"], [0, "&rcedil;"], [0, "&Rcaron;"], [0, "&rcaron;"], [0, "&Sacute;"], [0, "&sacute;"], [0, "&Scirc;"], [0, "&scirc;"], [0, "&Scedil;"], [0, "&scedil;"], [0, "&Scaron;"], [0, "&scaron;"], [0, "&Tcedil;"], [0, "&tcedil;"], [0, "&Tcaron;"], [0, "&tcaron;"], [0, "&Tstrok;"], [0, "&tstrok;"], [0, "&Utilde;"], [0, "&utilde;"], [0, "&Umacr;"], [0, "&umacr;"], [0, "&Ubreve;"], [0, "&ubreve;"], [0, "&Uring;"], [0, "&uring;"], [0, "&Udblac;"], [0, "&udblac;"], [0, "&Uogon;"], [0, "&uogon;"], [0, "&Wcirc;"], [0, "&wcirc;"], [0, "&Ycirc;"], [0, "&ycirc;"], [0, "&Yuml;"], [0, "&Zacute;"], [0, "&zacute;"], [0, "&Zdot;"], [0, "&zdot;"], [0, "&Zcaron;"], [0, "&zcaron;"], [19, "&fnof;"], [34, "&imped;"], [63, "&gacute;"], [65, "&jmath;"], [142, "&circ;"], [0, "&caron;"], [16, "&breve;"], [0, "&DiacriticalDot;"], [0, "&ring;"], [0, "&ogon;"], [0, "&DiacriticalTilde;"], [0, "&dblac;"], [51, "&DownBreve;"], [127, "&Alpha;"], [0, "&Beta;"], [0, "&Gamma;"], [0, "&Delta;"], [0, "&Epsilon;"], [0, "&Zeta;"], [0, "&Eta;"], [0, "&Theta;"], [0, "&Iota;"], [0, "&Kappa;"], [0, "&Lambda;"], [0, "&Mu;"], [0, "&Nu;"], [0, "&Xi;"], [0, "&Omicron;"], [0, "&Pi;"], [0, "&Rho;"], [1, "&Sigma;"], [0, "&Tau;"], [0, "&Upsilon;"], [0, "&Phi;"], [0, "&Chi;"], [0, "&Psi;"], [0, "&ohm;"], [7, "&alpha;"], [0, "&beta;"], [0, "&gamma;"], [0, "&delta;"], [0, "&epsi;"], [0, "&zeta;"], [0, "&eta;"], [0, "&theta;"], [0, "&iota;"], [0, "&kappa;"], [0, "&lambda;"], [0, "&mu;"], [0, "&nu;"], [0, "&xi;"], [0, "&omicron;"], [0, "&pi;"], [0, "&rho;"], [0, "&sigmaf;"], [0, "&sigma;"], [0, "&tau;"], [0, "&upsi;"], [0, "&phi;"], [0, "&chi;"], [0, "&psi;"], [0, "&omega;"], [7, "&thetasym;"], [0, "&Upsi;"], [2, "&phiv;"], [0, "&piv;"], [5, "&Gammad;"], [0, "&digamma;"], [18, "&kappav;"], [0, "&rhov;"], [3, "&epsiv;"], [0, "&backepsilon;"], [10, "&IOcy;"], [0, "&DJcy;"], [0, "&GJcy;"], [0, "&Jukcy;"], [0, "&DScy;"], [0, "&Iukcy;"], [0, "&YIcy;"], [0, "&Jsercy;"], [0, "&LJcy;"], [0, "&NJcy;"], [0, "&TSHcy;"], [0, "&KJcy;"], [1, "&Ubrcy;"], [0, "&DZcy;"], [0, "&Acy;"], [0, "&Bcy;"], [0, "&Vcy;"], [0, "&Gcy;"], [0, "&Dcy;"], [0, "&IEcy;"], [0, "&ZHcy;"], [0, "&Zcy;"], [0, "&Icy;"], [0, "&Jcy;"], [0, "&Kcy;"], [0, "&Lcy;"], [0, "&Mcy;"], [0, "&Ncy;"], [0, "&Ocy;"], [0, "&Pcy;"], [0, "&Rcy;"], [0, "&Scy;"], [0, "&Tcy;"], [0, "&Ucy;"], [0, "&Fcy;"], [0, "&KHcy;"], [0, "&TScy;"], [0, "&CHcy;"], [0, "&SHcy;"], [0, "&SHCHcy;"], [0, "&HARDcy;"], [0, "&Ycy;"], [0, "&SOFTcy;"], [0, "&Ecy;"], [0, "&YUcy;"], [0, "&YAcy;"], [0, "&acy;"], [0, "&bcy;"], [0, "&vcy;"], [0, "&gcy;"], [0, "&dcy;"], [0, "&iecy;"], [0, "&zhcy;"], [0, "&zcy;"], [0, "&icy;"], [0, "&jcy;"], [0, "&kcy;"], [0, "&lcy;"], [0, "&mcy;"], [0, "&ncy;"], [0, "&ocy;"], [0, "&pcy;"], [0, "&rcy;"], [0, "&scy;"], [0, "&tcy;"], [0, "&ucy;"], [0, "&fcy;"], [0, "&khcy;"], [0, "&tscy;"], [0, "&chcy;"], [0, "&shcy;"], [0, "&shchcy;"], [0, "&hardcy;"], [0, "&ycy;"], [0, "&softcy;"], [0, "&ecy;"], [0, "&yucy;"], [0, "&yacy;"], [1, "&iocy;"], [0, "&djcy;"], [0, "&gjcy;"], [0, "&jukcy;"], [0, "&dscy;"], [0, "&iukcy;"], [0, "&yicy;"], [0, "&jsercy;"], [0, "&ljcy;"], [0, "&njcy;"], [0, "&tshcy;"], [0, "&kjcy;"], [1, "&ubrcy;"], [0, "&dzcy;"], [7074, "&ensp;"], [0, "&emsp;"], [0, "&emsp13;"], [0, "&emsp14;"], [1, "&numsp;"], [0, "&puncsp;"], [0, "&ThinSpace;"], [0, "&hairsp;"], [0, "&NegativeMediumSpace;"], [0, "&zwnj;"], [0, "&zwj;"], [0, "&lrm;"], [0, "&rlm;"], [0, "&dash;"], [2, "&ndash;"], [0, "&mdash;"], [0, "&horbar;"], [0, "&Verbar;"], [1, "&lsquo;"], [0, "&CloseCurlyQuote;"], [0, "&lsquor;"], [1, "&ldquo;"], [0, "&CloseCurlyDoubleQuote;"], [0, "&bdquo;"], [1, "&dagger;"], [0, "&Dagger;"], [0, "&bull;"], [2, "&nldr;"], [0, "&hellip;"], [9, "&permil;"], [0, "&pertenk;"], [0, "&prime;"], [0, "&Prime;"], [0, "&tprime;"], [0, "&backprime;"], [3, "&lsaquo;"], [0, "&rsaquo;"], [3, "&oline;"], [2, "&caret;"], [1, "&hybull;"], [0, "&frasl;"], [10, "&bsemi;"], [7, "&qprime;"], [7, { v: "&MediumSpace;", n: 8202, o: "&ThickSpace;" }], [0, "&NoBreak;"], [0, "&af;"], [0, "&InvisibleTimes;"], [0, "&ic;"], [72, "&euro;"], [46, "&tdot;"], [0, "&DotDot;"], [37, "&complexes;"], [2, "&incare;"], [4, "&gscr;"], [0, "&hamilt;"], [0, "&Hfr;"], [0, "&Hopf;"], [0, "&planckh;"], [0, "&hbar;"], [0, "&imagline;"], [0, "&Ifr;"], [0, "&lagran;"], [0, "&ell;"], [1, "&naturals;"], [0, "&numero;"], [0, "&copysr;"], [0, "&weierp;"], [0, "&Popf;"], [0, "&Qopf;"], [0, "&realine;"], [0, "&real;"], [0, "&reals;"], [0, "&rx;"], [3, "&trade;"], [1, "&integers;"], [2, "&mho;"], [0, "&zeetrf;"], [0, "&iiota;"], [2, "&bernou;"], [0, "&Cayleys;"], [1, "&escr;"], [0, "&Escr;"], [0, "&Fouriertrf;"], [1, "&Mellintrf;"], [0, "&order;"], [0, "&alefsym;"], [0, "&beth;"], [0, "&gimel;"], [0, "&daleth;"], [12, "&CapitalDifferentialD;"], [0, "&dd;"], [0, "&ee;"], [0, "&ii;"], [10, "&frac13;"], [0, "&frac23;"], [0, "&frac15;"], [0, "&frac25;"], [0, "&frac35;"], [0, "&frac45;"], [0, "&frac16;"], [0, "&frac56;"], [0, "&frac18;"], [0, "&frac38;"], [0, "&frac58;"], [0, "&frac78;"], [49, "&larr;"], [0, "&ShortUpArrow;"], [0, "&rarr;"], [0, "&darr;"], [0, "&harr;"], [0, "&updownarrow;"], [0, "&nwarr;"], [0, "&nearr;"], [0, "&LowerRightArrow;"], [0, "&LowerLeftArrow;"], [0, "&nlarr;"], [0, "&nrarr;"], [1, { v: "&rarrw;", n: 824, o: "&nrarrw;" }], [0, "&Larr;"], [0, "&Uarr;"], [0, "&Rarr;"], [0, "&Darr;"], [0, "&larrtl;"], [0, "&rarrtl;"], [0, "&LeftTeeArrow;"], [0, "&mapstoup;"], [0, "&map;"], [0, "&DownTeeArrow;"], [1, "&hookleftarrow;"], [0, "&hookrightarrow;"], [0, "&larrlp;"], [0, "&looparrowright;"], [0, "&harrw;"], [0, "&nharr;"], [1, "&lsh;"], [0, "&rsh;"], [0, "&ldsh;"], [0, "&rdsh;"], [1, "&crarr;"], [0, "&cularr;"], [0, "&curarr;"], [2, "&circlearrowleft;"], [0, "&circlearrowright;"], [0, "&leftharpoonup;"], [0, "&DownLeftVector;"], [0, "&RightUpVector;"], [0, "&LeftUpVector;"], [0, "&rharu;"], [0, "&DownRightVector;"], [0, "&dharr;"], [0, "&dharl;"], [0, "&RightArrowLeftArrow;"], [0, "&udarr;"], [0, "&LeftArrowRightArrow;"], [0, "&leftleftarrows;"], [0, "&upuparrows;"], [0, "&rightrightarrows;"], [0, "&ddarr;"], [0, "&leftrightharpoons;"], [0, "&Equilibrium;"], [0, "&nlArr;"], [0, "&nhArr;"], [0, "&nrArr;"], [0, "&DoubleLeftArrow;"], [0, "&DoubleUpArrow;"], [0, "&DoubleRightArrow;"], [0, "&dArr;"], [0, "&DoubleLeftRightArrow;"], [0, "&DoubleUpDownArrow;"], [0, "&nwArr;"], [0, "&neArr;"], [0, "&seArr;"], [0, "&swArr;"], [0, "&lAarr;"], [0, "&rAarr;"], [1, "&zigrarr;"], [6, "&larrb;"], [0, "&rarrb;"], [15, "&DownArrowUpArrow;"], [7, "&loarr;"], [0, "&roarr;"], [0, "&hoarr;"], [0, "&forall;"], [0, "&comp;"], [0, { v: "&part;", n: 824, o: "&npart;" }], [0, "&exist;"], [0, "&nexist;"], [0, "&empty;"], [1, "&Del;"], [0, "&Element;"], [0, "&NotElement;"], [1, "&ni;"], [0, "&notni;"], [2, "&prod;"], [0, "&coprod;"], [0, "&sum;"], [0, "&minus;"], [0, "&MinusPlus;"], [0, "&dotplus;"], [1, "&Backslash;"], [0, "&lowast;"], [0, "&compfn;"], [1, "&radic;"], [2, "&prop;"], [0, "&infin;"], [0, "&angrt;"], [0, { v: "&ang;", n: 8402, o: "&nang;" }], [0, "&angmsd;"], [0, "&angsph;"], [0, "&mid;"], [0, "&nmid;"], [0, "&DoubleVerticalBar;"], [0, "&NotDoubleVerticalBar;"], [0, "&and;"], [0, "&or;"], [0, { v: "&cap;", n: 65024, o: "&caps;" }], [0, { v: "&cup;", n: 65024, o: "&cups;" }], [0, "&int;"], [0, "&Int;"], [0, "&iiint;"], [0, "&conint;"], [0, "&Conint;"], [0, "&Cconint;"], [0, "&cwint;"], [0, "&ClockwiseContourIntegral;"], [0, "&awconint;"], [0, "&there4;"], [0, "&becaus;"], [0, "&ratio;"], [0, "&Colon;"], [0, "&dotminus;"], [1, "&mDDot;"], [0, "&homtht;"], [0, { v: "&sim;", n: 8402, o: "&nvsim;" }], [0, { v: "&backsim;", n: 817, o: "&race;" }], [0, { v: "&ac;", n: 819, o: "&acE;" }], [0, "&acd;"], [0, "&VerticalTilde;"], [0, "&NotTilde;"], [0, { v: "&eqsim;", n: 824, o: "&nesim;" }], [0, "&sime;"], [0, "&NotTildeEqual;"], [0, "&cong;"], [0, "&simne;"], [0, "&ncong;"], [0, "&ap;"], [0, "&nap;"], [0, "&ape;"], [0, { v: "&apid;", n: 824, o: "&napid;" }], [0, "&backcong;"], [0, { v: "&asympeq;", n: 8402, o: "&nvap;" }], [0, { v: "&bump;", n: 824, o: "&nbump;" }], [0, { v: "&bumpe;", n: 824, o: "&nbumpe;" }], [0, { v: "&doteq;", n: 824, o: "&nedot;" }], [0, "&doteqdot;"], [0, "&efDot;"], [0, "&erDot;"], [0, "&Assign;"], [0, "&ecolon;"], [0, "&ecir;"], [0, "&circeq;"], [1, "&wedgeq;"], [0, "&veeeq;"], [1, "&triangleq;"], [2, "&equest;"], [0, "&ne;"], [0, { v: "&Congruent;", n: 8421, o: "&bnequiv;" }], [0, "&nequiv;"], [1, { v: "&le;", n: 8402, o: "&nvle;" }], [0, { v: "&ge;", n: 8402, o: "&nvge;" }], [0, { v: "&lE;", n: 824, o: "&nlE;" }], [0, { v: "&gE;", n: 824, o: "&ngE;" }], [0, { v: "&lnE;", n: 65024, o: "&lvertneqq;" }], [0, { v: "&gnE;", n: 65024, o: "&gvertneqq;" }], [0, { v: "&ll;", n: new Map(/* @__PURE__ */ restoreDiff([[824, "&nLtv;"], [7577, "&nLt;"]])) }], [0, { v: "&gg;", n: new Map(/* @__PURE__ */ restoreDiff([[824, "&nGtv;"], [7577, "&nGt;"]])) }], [0, "&between;"], [0, "&NotCupCap;"], [0, "&nless;"], [0, "&ngt;"], [0, "&nle;"], [0, "&nge;"], [0, "&lesssim;"], [0, "&GreaterTilde;"], [0, "&nlsim;"], [0, "&ngsim;"], [0, "&LessGreater;"], [0, "&gl;"], [0, "&NotLessGreater;"], [0, "&NotGreaterLess;"], [0, "&pr;"], [0, "&sc;"], [0, "&prcue;"], [0, "&sccue;"], [0, "&PrecedesTilde;"], [0, { v: "&scsim;", n: 824, o: "&NotSucceedsTilde;" }], [0, "&NotPrecedes;"], [0, "&NotSucceeds;"], [0, { v: "&sub;", n: 8402, o: "&NotSubset;" }], [0, { v: "&sup;", n: 8402, o: "&NotSuperset;" }], [0, "&nsub;"], [0, "&nsup;"], [0, "&sube;"], [0, "&supe;"], [0, "&NotSubsetEqual;"], [0, "&NotSupersetEqual;"], [0, { v: "&subne;", n: 65024, o: "&varsubsetneq;" }], [0, { v: "&supne;", n: 65024, o: "&varsupsetneq;" }], [1, "&cupdot;"], [0, "&UnionPlus;"], [0, { v: "&sqsub;", n: 824, o: "&NotSquareSubset;" }], [0, { v: "&sqsup;", n: 824, o: "&NotSquareSuperset;" }], [0, "&sqsube;"], [0, "&sqsupe;"], [0, { v: "&sqcap;", n: 65024, o: "&sqcaps;" }], [0, { v: "&sqcup;", n: 65024, o: "&sqcups;" }], [0, "&CirclePlus;"], [0, "&CircleMinus;"], [0, "&CircleTimes;"], [0, "&osol;"], [0, "&CircleDot;"], [0, "&circledcirc;"], [0, "&circledast;"], [1, "&circleddash;"], [0, "&boxplus;"], [0, "&boxminus;"], [0, "&boxtimes;"], [0, "&dotsquare;"], [0, "&RightTee;"], [0, "&dashv;"], [0, "&DownTee;"], [0, "&bot;"], [1, "&models;"], [0, "&DoubleRightTee;"], [0, "&Vdash;"], [0, "&Vvdash;"], [0, "&VDash;"], [0, "&nvdash;"], [0, "&nvDash;"], [0, "&nVdash;"], [0, "&nVDash;"], [0, "&prurel;"], [1, "&LeftTriangle;"], [0, "&RightTriangle;"], [0, { v: "&LeftTriangleEqual;", n: 8402, o: "&nvltrie;" }], [0, { v: "&RightTriangleEqual;", n: 8402, o: "&nvrtrie;" }], [0, "&origof;"], [0, "&imof;"], [0, "&multimap;"], [0, "&hercon;"], [0, "&intcal;"], [0, "&veebar;"], [1, "&barvee;"], [0, "&angrtvb;"], [0, "&lrtri;"], [0, "&bigwedge;"], [0, "&bigvee;"], [0, "&bigcap;"], [0, "&bigcup;"], [0, "&diam;"], [0, "&sdot;"], [0, "&sstarf;"], [0, "&divideontimes;"], [0, "&bowtie;"], [0, "&ltimes;"], [0, "&rtimes;"], [0, "&leftthreetimes;"], [0, "&rightthreetimes;"], [0, "&backsimeq;"], [0, "&curlyvee;"], [0, "&curlywedge;"], [0, "&Sub;"], [0, "&Sup;"], [0, "&Cap;"], [0, "&Cup;"], [0, "&fork;"], [0, "&epar;"], [0, "&lessdot;"], [0, "&gtdot;"], [0, { v: "&Ll;", n: 824, o: "&nLl;" }], [0, { v: "&Gg;", n: 824, o: "&nGg;" }], [0, { v: "&leg;", n: 65024, o: "&lesg;" }], [0, { v: "&gel;", n: 65024, o: "&gesl;" }], [2, "&cuepr;"], [0, "&cuesc;"], [0, "&NotPrecedesSlantEqual;"], [0, "&NotSucceedsSlantEqual;"], [0, "&NotSquareSubsetEqual;"], [0, "&NotSquareSupersetEqual;"], [2, "&lnsim;"], [0, "&gnsim;"], [0, "&precnsim;"], [0, "&scnsim;"], [0, "&nltri;"], [0, "&NotRightTriangle;"], [0, "&nltrie;"], [0, "&NotRightTriangleEqual;"], [0, "&vellip;"], [0, "&ctdot;"], [0, "&utdot;"], [0, "&dtdot;"], [0, "&disin;"], [0, "&isinsv;"], [0, "&isins;"], [0, { v: "&isindot;", n: 824, o: "&notindot;" }], [0, "&notinvc;"], [0, "&notinvb;"], [1, { v: "&isinE;", n: 824, o: "&notinE;" }], [0, "&nisd;"], [0, "&xnis;"], [0, "&nis;"], [0, "&notnivc;"], [0, "&notnivb;"], [6, "&barwed;"], [0, "&Barwed;"], [1, "&lceil;"], [0, "&rceil;"], [0, "&LeftFloor;"], [0, "&rfloor;"], [0, "&drcrop;"], [0, "&dlcrop;"], [0, "&urcrop;"], [0, "&ulcrop;"], [0, "&bnot;"], [1, "&profline;"], [0, "&profsurf;"], [1, "&telrec;"], [0, "&target;"], [5, "&ulcorn;"], [0, "&urcorn;"], [0, "&dlcorn;"], [0, "&drcorn;"], [2, "&frown;"], [0, "&smile;"], [9, "&cylcty;"], [0, "&profalar;"], [7, "&topbot;"], [6, "&ovbar;"], [1, "&solbar;"], [60, "&angzarr;"], [51, "&lmoustache;"], [0, "&rmoustache;"], [2, "&OverBracket;"], [0, "&bbrk;"], [0, "&bbrktbrk;"], [37, "&OverParenthesis;"], [0, "&UnderParenthesis;"], [0, "&OverBrace;"], [0, "&UnderBrace;"], [2, "&trpezium;"], [4, "&elinters;"], [59, "&blank;"], [164, "&circledS;"], [55, "&boxh;"], [1, "&boxv;"], [9, "&boxdr;"], [3, "&boxdl;"], [3, "&boxur;"], [3, "&boxul;"], [3, "&boxvr;"], [7, "&boxvl;"], [7, "&boxhd;"], [7, "&boxhu;"], [7, "&boxvh;"], [19, "&boxH;"], [0, "&boxV;"], [0, "&boxdR;"], [0, "&boxDr;"], [0, "&boxDR;"], [0, "&boxdL;"], [0, "&boxDl;"], [0, "&boxDL;"], [0, "&boxuR;"], [0, "&boxUr;"], [0, "&boxUR;"], [0, "&boxuL;"], [0, "&boxUl;"], [0, "&boxUL;"], [0, "&boxvR;"], [0, "&boxVr;"], [0, "&boxVR;"], [0, "&boxvL;"], [0, "&boxVl;"], [0, "&boxVL;"], [0, "&boxHd;"], [0, "&boxhD;"], [0, "&boxHD;"], [0, "&boxHu;"], [0, "&boxhU;"], [0, "&boxHU;"], [0, "&boxvH;"], [0, "&boxVh;"], [0, "&boxVH;"], [19, "&uhblk;"], [3, "&lhblk;"], [3, "&block;"], [8, "&blk14;"], [0, "&blk12;"], [0, "&blk34;"], [13, "&square;"], [8, "&blacksquare;"], [0, "&EmptyVerySmallSquare;"], [1, "&rect;"], [0, "&marker;"], [2, "&fltns;"], [1, "&bigtriangleup;"], [0, "&blacktriangle;"], [0, "&triangle;"], [2, "&blacktriangleright;"], [0, "&rtri;"], [3, "&bigtriangledown;"], [0, "&blacktriangledown;"], [0, "&dtri;"], [2, "&blacktriangleleft;"], [0, "&ltri;"], [6, "&loz;"], [0, "&cir;"], [32, "&tridot;"], [2, "&bigcirc;"], [8, "&ultri;"], [0, "&urtri;"], [0, "&lltri;"], [0, "&EmptySmallSquare;"], [0, "&FilledSmallSquare;"], [8, "&bigstar;"], [0, "&star;"], [7, "&phone;"], [49, "&female;"], [1, "&male;"], [29, "&spades;"], [2, "&clubs;"], [1, "&hearts;"], [0, "&diamondsuit;"], [3, "&sung;"], [2, "&flat;"], [0, "&natural;"], [0, "&sharp;"], [163, "&check;"], [3, "&cross;"], [8, "&malt;"], [21, "&sext;"], [33, "&VerticalSeparator;"], [25, "&lbbrk;"], [0, "&rbbrk;"], [84, "&bsolhsub;"], [0, "&suphsol;"], [28, "&LeftDoubleBracket;"], [0, "&RightDoubleBracket;"], [0, "&lang;"], [0, "&rang;"], [0, "&Lang;"], [0, "&Rang;"], [0, "&loang;"], [0, "&roang;"], [7, "&longleftarrow;"], [0, "&longrightarrow;"], [0, "&longleftrightarrow;"], [0, "&DoubleLongLeftArrow;"], [0, "&DoubleLongRightArrow;"], [0, "&DoubleLongLeftRightArrow;"], [1, "&longmapsto;"], [2, "&dzigrarr;"], [258, "&nvlArr;"], [0, "&nvrArr;"], [0, "&nvHarr;"], [0, "&Map;"], [6, "&lbarr;"], [0, "&bkarow;"], [0, "&lBarr;"], [0, "&dbkarow;"], [0, "&drbkarow;"], [0, "&DDotrahd;"], [0, "&UpArrowBar;"], [0, "&DownArrowBar;"], [2, "&Rarrtl;"], [2, "&latail;"], [0, "&ratail;"], [0, "&lAtail;"], [0, "&rAtail;"], [0, "&larrfs;"], [0, "&rarrfs;"], [0, "&larrbfs;"], [0, "&rarrbfs;"], [2, "&nwarhk;"], [0, "&nearhk;"], [0, "&hksearow;"], [0, "&hkswarow;"], [0, "&nwnear;"], [0, "&nesear;"], [0, "&seswar;"], [0, "&swnwar;"], [8, { v: "&rarrc;", n: 824, o: "&nrarrc;" }], [1, "&cudarrr;"], [0, "&ldca;"], [0, "&rdca;"], [0, "&cudarrl;"], [0, "&larrpl;"], [2, "&curarrm;"], [0, "&cularrp;"], [7, "&rarrpl;"], [2, "&harrcir;"], [0, "&Uarrocir;"], [0, "&lurdshar;"], [0, "&ldrushar;"], [2, "&LeftRightVector;"], [0, "&RightUpDownVector;"], [0, "&DownLeftRightVector;"], [0, "&LeftUpDownVector;"], [0, "&LeftVectorBar;"], [0, "&RightVectorBar;"], [0, "&RightUpVectorBar;"], [0, "&RightDownVectorBar;"], [0, "&DownLeftVectorBar;"], [0, "&DownRightVectorBar;"], [0, "&LeftUpVectorBar;"], [0, "&LeftDownVectorBar;"], [0, "&LeftTeeVector;"], [0, "&RightTeeVector;"], [0, "&RightUpTeeVector;"], [0, "&RightDownTeeVector;"], [0, "&DownLeftTeeVector;"], [0, "&DownRightTeeVector;"], [0, "&LeftUpTeeVector;"], [0, "&LeftDownTeeVector;"], [0, "&lHar;"], [0, "&uHar;"], [0, "&rHar;"], [0, "&dHar;"], [0, "&luruhar;"], [0, "&ldrdhar;"], [0, "&ruluhar;"], [0, "&rdldhar;"], [0, "&lharul;"], [0, "&llhard;"], [0, "&rharul;"], [0, "&lrhard;"], [0, "&udhar;"], [0, "&duhar;"], [0, "&RoundImplies;"], [0, "&erarr;"], [0, "&simrarr;"], [0, "&larrsim;"], [0, "&rarrsim;"], [0, "&rarrap;"], [0, "&ltlarr;"], [1, "&gtrarr;"], [0, "&subrarr;"], [1, "&suplarr;"], [0, "&lfisht;"], [0, "&rfisht;"], [0, "&ufisht;"], [0, "&dfisht;"], [5, "&lopar;"], [0, "&ropar;"], [4, "&lbrke;"], [0, "&rbrke;"], [0, "&lbrkslu;"], [0, "&rbrksld;"], [0, "&lbrksld;"], [0, "&rbrkslu;"], [0, "&langd;"], [0, "&rangd;"], [0, "&lparlt;"], [0, "&rpargt;"], [0, "&gtlPar;"], [0, "&ltrPar;"], [3, "&vzigzag;"], [1, "&vangrt;"], [0, "&angrtvbd;"], [6, "&ange;"], [0, "&range;"], [0, "&dwangle;"], [0, "&uwangle;"], [0, "&angmsdaa;"], [0, "&angmsdab;"], [0, "&angmsdac;"], [0, "&angmsdad;"], [0, "&angmsdae;"], [0, "&angmsdaf;"], [0, "&angmsdag;"], [0, "&angmsdah;"], [0, "&bemptyv;"], [0, "&demptyv;"], [0, "&cemptyv;"], [0, "&raemptyv;"], [0, "&laemptyv;"], [0, "&ohbar;"], [0, "&omid;"], [0, "&opar;"], [1, "&operp;"], [1, "&olcross;"], [0, "&odsold;"], [1, "&olcir;"], [0, "&ofcir;"], [0, "&olt;"], [0, "&ogt;"], [0, "&cirscir;"], [0, "&cirE;"], [0, "&solb;"], [0, "&bsolb;"], [3, "&boxbox;"], [3, "&trisb;"], [0, "&rtriltri;"], [0, { v: "&LeftTriangleBar;", n: 824, o: "&NotLeftTriangleBar;" }], [0, { v: "&RightTriangleBar;", n: 824, o: "&NotRightTriangleBar;" }], [11, "&iinfin;"], [0, "&infintie;"], [0, "&nvinfin;"], [4, "&eparsl;"], [0, "&smeparsl;"], [0, "&eqvparsl;"], [5, "&blacklozenge;"], [8, "&RuleDelayed;"], [1, "&dsol;"], [9, "&bigodot;"], [0, "&bigoplus;"], [0, "&bigotimes;"], [1, "&biguplus;"], [1, "&bigsqcup;"], [5, "&iiiint;"], [0, "&fpartint;"], [2, "&cirfnint;"], [0, "&awint;"], [0, "&rppolint;"], [0, "&scpolint;"], [0, "&npolint;"], [0, "&pointint;"], [0, "&quatint;"], [0, "&intlarhk;"], [10, "&pluscir;"], [0, "&plusacir;"], [0, "&simplus;"], [0, "&plusdu;"], [0, "&plussim;"], [0, "&plustwo;"], [1, "&mcomma;"], [0, "&minusdu;"], [2, "&loplus;"], [0, "&roplus;"], [0, "&Cross;"], [0, "&timesd;"], [0, "&timesbar;"], [1, "&smashp;"], [0, "&lotimes;"], [0, "&rotimes;"], [0, "&otimesas;"], [0, "&Otimes;"], [0, "&odiv;"], [0, "&triplus;"], [0, "&triminus;"], [0, "&tritime;"], [0, "&intprod;"], [2, "&amalg;"], [0, "&capdot;"], [1, "&ncup;"], [0, "&ncap;"], [0, "&capand;"], [0, "&cupor;"], [0, "&cupcap;"], [0, "&capcup;"], [0, "&cupbrcap;"], [0, "&capbrcup;"], [0, "&cupcup;"], [0, "&capcap;"], [0, "&ccups;"], [0, "&ccaps;"], [2, "&ccupssm;"], [2, "&And;"], [0, "&Or;"], [0, "&andand;"], [0, "&oror;"], [0, "&orslope;"], [0, "&andslope;"], [1, "&andv;"], [0, "&orv;"], [0, "&andd;"], [0, "&ord;"], [1, "&wedbar;"], [6, "&sdote;"], [3, "&simdot;"], [2, { v: "&congdot;", n: 824, o: "&ncongdot;" }], [0, "&easter;"], [0, "&apacir;"], [0, { v: "&apE;", n: 824, o: "&napE;" }], [0, "&eplus;"], [0, "&pluse;"], [0, "&Esim;"], [0, "&Colone;"], [0, "&Equal;"], [1, "&ddotseq;"], [0, "&equivDD;"], [0, "&ltcir;"], [0, "&gtcir;"], [0, "&ltquest;"], [0, "&gtquest;"], [0, { v: "&leqslant;", n: 824, o: "&nleqslant;" }], [0, { v: "&geqslant;", n: 824, o: "&ngeqslant;" }], [0, "&lesdot;"], [0, "&gesdot;"], [0, "&lesdoto;"], [0, "&gesdoto;"], [0, "&lesdotor;"], [0, "&gesdotol;"], [0, "&lap;"], [0, "&gap;"], [0, "&lne;"], [0, "&gne;"], [0, "&lnap;"], [0, "&gnap;"], [0, "&lEg;"], [0, "&gEl;"], [0, "&lsime;"], [0, "&gsime;"], [0, "&lsimg;"], [0, "&gsiml;"], [0, "&lgE;"], [0, "&glE;"], [0, "&lesges;"], [0, "&gesles;"], [0, "&els;"], [0, "&egs;"], [0, "&elsdot;"], [0, "&egsdot;"], [0, "&el;"], [0, "&eg;"], [2, "&siml;"], [0, "&simg;"], [0, "&simlE;"], [0, "&simgE;"], [0, { v: "&LessLess;", n: 824, o: "&NotNestedLessLess;" }], [0, { v: "&GreaterGreater;", n: 824, o: "&NotNestedGreaterGreater;" }], [1, "&glj;"], [0, "&gla;"], [0, "&ltcc;"], [0, "&gtcc;"], [0, "&lescc;"], [0, "&gescc;"], [0, "&smt;"], [0, "&lat;"], [0, { v: "&smte;", n: 65024, o: "&smtes;" }], [0, { v: "&late;", n: 65024, o: "&lates;" }], [0, "&bumpE;"], [0, { v: "&PrecedesEqual;", n: 824, o: "&NotPrecedesEqual;" }], [0, { v: "&sce;", n: 824, o: "&NotSucceedsEqual;" }], [2, "&prE;"], [0, "&scE;"], [0, "&precneqq;"], [0, "&scnE;"], [0, "&prap;"], [0, "&scap;"], [0, "&precnapprox;"], [0, "&scnap;"], [0, "&Pr;"], [0, "&Sc;"], [0, "&subdot;"], [0, "&supdot;"], [0, "&subplus;"], [0, "&supplus;"], [0, "&submult;"], [0, "&supmult;"], [0, "&subedot;"], [0, "&supedot;"], [0, { v: "&subE;", n: 824, o: "&nsubE;" }], [0, { v: "&supE;", n: 824, o: "&nsupE;" }], [0, "&subsim;"], [0, "&supsim;"], [2, { v: "&subnE;", n: 65024, o: "&varsubsetneqq;" }], [0, { v: "&supnE;", n: 65024, o: "&varsupsetneqq;" }], [2, "&csub;"], [0, "&csup;"], [0, "&csube;"], [0, "&csupe;"], [0, "&subsup;"], [0, "&supsub;"], [0, "&subsub;"], [0, "&supsup;"], [0, "&suphsub;"], [0, "&supdsub;"], [0, "&forkv;"], [0, "&topfork;"], [0, "&mlcp;"], [8, "&Dashv;"], [1, "&Vdashl;"], [0, "&Barv;"], [0, "&vBar;"], [0, "&vBarv;"], [1, "&Vbar;"], [0, "&Not;"], [0, "&bNot;"], [0, "&rnmid;"], [0, "&cirmid;"], [0, "&midcir;"], [0, "&topcir;"], [0, "&nhpar;"], [0, "&parsim;"], [9, { v: "&parsl;", n: 8421, o: "&nparsl;" }], [44343, { n: new Map(/* @__PURE__ */ restoreDiff([[56476, "&Ascr;"], [1, "&Cscr;"], [0, "&Dscr;"], [2, "&Gscr;"], [2, "&Jscr;"], [0, "&Kscr;"], [2, "&Nscr;"], [0, "&Oscr;"], [0, "&Pscr;"], [0, "&Qscr;"], [1, "&Sscr;"], [0, "&Tscr;"], [0, "&Uscr;"], [0, "&Vscr;"], [0, "&Wscr;"], [0, "&Xscr;"], [0, "&Yscr;"], [0, "&Zscr;"], [0, "&ascr;"], [0, "&bscr;"], [0, "&cscr;"], [0, "&dscr;"], [1, "&fscr;"], [1, "&hscr;"], [0, "&iscr;"], [0, "&jscr;"], [0, "&kscr;"], [0, "&lscr;"], [0, "&mscr;"], [0, "&nscr;"], [1, "&pscr;"], [0, "&qscr;"], [0, "&rscr;"], [0, "&sscr;"], [0, "&tscr;"], [0, "&uscr;"], [0, "&vscr;"], [0, "&wscr;"], [0, "&xscr;"], [0, "&yscr;"], [0, "&zscr;"], [52, "&Afr;"], [0, "&Bfr;"], [1, "&Dfr;"], [0, "&Efr;"], [0, "&Ffr;"], [0, "&Gfr;"], [2, "&Jfr;"], [0, "&Kfr;"], [0, "&Lfr;"], [0, "&Mfr;"], [0, "&Nfr;"], [0, "&Ofr;"], [0, "&Pfr;"], [0, "&Qfr;"], [1, "&Sfr;"], [0, "&Tfr;"], [0, "&Ufr;"], [0, "&Vfr;"], [0, "&Wfr;"], [0, "&Xfr;"], [0, "&Yfr;"], [1, "&afr;"], [0, "&bfr;"], [0, "&cfr;"], [0, "&dfr;"], [0, "&efr;"], [0, "&ffr;"], [0, "&gfr;"], [0, "&hfr;"], [0, "&ifr;"], [0, "&jfr;"], [0, "&kfr;"], [0, "&lfr;"], [0, "&mfr;"], [0, "&nfr;"], [0, "&ofr;"], [0, "&pfr;"], [0, "&qfr;"], [0, "&rfr;"], [0, "&sfr;"], [0, "&tfr;"], [0, "&ufr;"], [0, "&vfr;"], [0, "&wfr;"], [0, "&xfr;"], [0, "&yfr;"], [0, "&zfr;"], [0, "&Aopf;"], [0, "&Bopf;"], [1, "&Dopf;"], [0, "&Eopf;"], [0, "&Fopf;"], [0, "&Gopf;"], [1, "&Iopf;"], [0, "&Jopf;"], [0, "&Kopf;"], [0, "&Lopf;"], [0, "&Mopf;"], [1, "&Oopf;"], [3, "&Sopf;"], [0, "&Topf;"], [0, "&Uopf;"], [0, "&Vopf;"], [0, "&Wopf;"], [0, "&Xopf;"], [0, "&Yopf;"], [1, "&aopf;"], [0, "&bopf;"], [0, "&copf;"], [0, "&dopf;"], [0, "&eopf;"], [0, "&fopf;"], [0, "&gopf;"], [0, "&hopf;"], [0, "&iopf;"], [0, "&jopf;"], [0, "&kopf;"], [0, "&lopf;"], [0, "&mopf;"], [0, "&nopf;"], [0, "&oopf;"], [0, "&popf;"], [0, "&qopf;"], [0, "&ropf;"], [0, "&sopf;"], [0, "&topf;"], [0, "&uopf;"], [0, "&vopf;"], [0, "&wopf;"], [0, "&xopf;"], [0, "&yopf;"], [0, "&zopf;"]])) }], [8906, "&fflig;"], [0, "&filig;"], [0, "&fllig;"], [0, "&ffilig;"], [0, "&ffllig;"]]));
  }
});

// node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/escape.js
var require_escape = __commonJS({
  "node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/escape.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.escapeText = exports2.escapeAttribute = exports2.escapeUTF8 = exports2.escape = exports2.encodeXML = exports2.getCodePoint = exports2.xmlReplacer = void 0;
    exports2.xmlReplacer = /["&'<>$\x80-\uFFFF]/g;
    var xmlCodeMap = /* @__PURE__ */ new Map([
      [34, "&quot;"],
      [38, "&amp;"],
      [39, "&apos;"],
      [60, "&lt;"],
      [62, "&gt;"]
    ]);
    exports2.getCodePoint = // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    String.prototype.codePointAt != null ? function(str, index) {
      return str.codePointAt(index);
    } : (
      // http://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
      function(c, index) {
        return (c.charCodeAt(index) & 64512) === 55296 ? (c.charCodeAt(index) - 55296) * 1024 + c.charCodeAt(index + 1) - 56320 + 65536 : c.charCodeAt(index);
      }
    );
    function encodeXML(str) {
      var ret = "";
      var lastIdx = 0;
      var match;
      while ((match = exports2.xmlReplacer.exec(str)) !== null) {
        var i = match.index;
        var char = str.charCodeAt(i);
        var next = xmlCodeMap.get(char);
        if (next !== void 0) {
          ret += str.substring(lastIdx, i) + next;
          lastIdx = i + 1;
        } else {
          ret += "".concat(str.substring(lastIdx, i), "&#x").concat((0, exports2.getCodePoint)(str, i).toString(16), ";");
          lastIdx = exports2.xmlReplacer.lastIndex += Number((char & 64512) === 55296);
        }
      }
      return ret + str.substr(lastIdx);
    }
    exports2.encodeXML = encodeXML;
    exports2.escape = encodeXML;
    function getEscaper(regex, map) {
      return function escape(data) {
        var match;
        var lastIdx = 0;
        var result = "";
        while (match = regex.exec(data)) {
          if (lastIdx !== match.index) {
            result += data.substring(lastIdx, match.index);
          }
          result += map.get(match[0].charCodeAt(0));
          lastIdx = match.index + 1;
        }
        return result + data.substring(lastIdx);
      };
    }
    exports2.escapeUTF8 = getEscaper(/[&<>'"]/g, xmlCodeMap);
    exports2.escapeAttribute = getEscaper(/["&\u00A0]/g, /* @__PURE__ */ new Map([
      [34, "&quot;"],
      [38, "&amp;"],
      [160, "&nbsp;"]
    ]));
    exports2.escapeText = getEscaper(/[&<>\u00A0]/g, /* @__PURE__ */ new Map([
      [38, "&amp;"],
      [60, "&lt;"],
      [62, "&gt;"],
      [160, "&nbsp;"]
    ]));
  }
});

// node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/encode.js
var require_encode = __commonJS({
  "node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/encode.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.encodeNonAsciiHTML = exports2.encodeHTML = void 0;
    var encode_html_js_1 = __importDefault(require_encode_html());
    var escape_js_1 = require_escape();
    var htmlReplacer = /[\t\n!-,./:-@[-`\f{-}$\x80-\uFFFF]/g;
    function encodeHTML(data) {
      return encodeHTMLTrieRe(htmlReplacer, data);
    }
    exports2.encodeHTML = encodeHTML;
    function encodeNonAsciiHTML(data) {
      return encodeHTMLTrieRe(escape_js_1.xmlReplacer, data);
    }
    exports2.encodeNonAsciiHTML = encodeNonAsciiHTML;
    function encodeHTMLTrieRe(regExp, str) {
      var ret = "";
      var lastIdx = 0;
      var match;
      while ((match = regExp.exec(str)) !== null) {
        var i = match.index;
        ret += str.substring(lastIdx, i);
        var char = str.charCodeAt(i);
        var next = encode_html_js_1.default.get(char);
        if (typeof next === "object") {
          if (i + 1 < str.length) {
            var nextChar = str.charCodeAt(i + 1);
            var value = typeof next.n === "number" ? next.n === nextChar ? next.o : void 0 : next.n.get(nextChar);
            if (value !== void 0) {
              ret += value;
              lastIdx = regExp.lastIndex += 1;
              continue;
            }
          }
          next = next.v;
        }
        if (next !== void 0) {
          ret += next;
          lastIdx = i + 1;
        } else {
          var cp = (0, escape_js_1.getCodePoint)(str, i);
          ret += "&#x".concat(cp.toString(16), ";");
          lastIdx = regExp.lastIndex += Number(cp !== char);
        }
      }
      return ret + str.substr(lastIdx);
    }
  }
});

// node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/index.js
var require_lib = __commonJS({
  "node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.decodeXMLStrict = exports2.decodeHTML5Strict = exports2.decodeHTML4Strict = exports2.decodeHTML5 = exports2.decodeHTML4 = exports2.decodeHTMLAttribute = exports2.decodeHTMLStrict = exports2.decodeHTML = exports2.decodeXML = exports2.DecodingMode = exports2.EntityDecoder = exports2.encodeHTML5 = exports2.encodeHTML4 = exports2.encodeNonAsciiHTML = exports2.encodeHTML = exports2.escapeText = exports2.escapeAttribute = exports2.escapeUTF8 = exports2.escape = exports2.encodeXML = exports2.encode = exports2.decodeStrict = exports2.decode = exports2.EncodingMode = exports2.EntityLevel = void 0;
    var decode_js_1 = require_decode();
    var encode_js_1 = require_encode();
    var escape_js_1 = require_escape();
    var EntityLevel;
    (function(EntityLevel2) {
      EntityLevel2[EntityLevel2["XML"] = 0] = "XML";
      EntityLevel2[EntityLevel2["HTML"] = 1] = "HTML";
    })(EntityLevel = exports2.EntityLevel || (exports2.EntityLevel = {}));
    var EncodingMode;
    (function(EncodingMode2) {
      EncodingMode2[EncodingMode2["UTF8"] = 0] = "UTF8";
      EncodingMode2[EncodingMode2["ASCII"] = 1] = "ASCII";
      EncodingMode2[EncodingMode2["Extensive"] = 2] = "Extensive";
      EncodingMode2[EncodingMode2["Attribute"] = 3] = "Attribute";
      EncodingMode2[EncodingMode2["Text"] = 4] = "Text";
    })(EncodingMode = exports2.EncodingMode || (exports2.EncodingMode = {}));
    function decode(data, options) {
      if (options === void 0) {
        options = EntityLevel.XML;
      }
      var level = typeof options === "number" ? options : options.level;
      if (level === EntityLevel.HTML) {
        var mode = typeof options === "object" ? options.mode : void 0;
        return (0, decode_js_1.decodeHTML)(data, mode);
      }
      return (0, decode_js_1.decodeXML)(data);
    }
    exports2.decode = decode;
    function decodeStrict(data, options) {
      var _a;
      if (options === void 0) {
        options = EntityLevel.XML;
      }
      var opts = typeof options === "number" ? { level: options } : options;
      (_a = opts.mode) !== null && _a !== void 0 ? _a : opts.mode = decode_js_1.DecodingMode.Strict;
      return decode(data, opts);
    }
    exports2.decodeStrict = decodeStrict;
    function encode(data, options) {
      if (options === void 0) {
        options = EntityLevel.XML;
      }
      var opts = typeof options === "number" ? { level: options } : options;
      if (opts.mode === EncodingMode.UTF8)
        return (0, escape_js_1.escapeUTF8)(data);
      if (opts.mode === EncodingMode.Attribute)
        return (0, escape_js_1.escapeAttribute)(data);
      if (opts.mode === EncodingMode.Text)
        return (0, escape_js_1.escapeText)(data);
      if (opts.level === EntityLevel.HTML) {
        if (opts.mode === EncodingMode.ASCII) {
          return (0, encode_js_1.encodeNonAsciiHTML)(data);
        }
        return (0, encode_js_1.encodeHTML)(data);
      }
      return (0, escape_js_1.encodeXML)(data);
    }
    exports2.encode = encode;
    var escape_js_2 = require_escape();
    Object.defineProperty(exports2, "encodeXML", { enumerable: true, get: function() {
      return escape_js_2.encodeXML;
    } });
    Object.defineProperty(exports2, "escape", { enumerable: true, get: function() {
      return escape_js_2.escape;
    } });
    Object.defineProperty(exports2, "escapeUTF8", { enumerable: true, get: function() {
      return escape_js_2.escapeUTF8;
    } });
    Object.defineProperty(exports2, "escapeAttribute", { enumerable: true, get: function() {
      return escape_js_2.escapeAttribute;
    } });
    Object.defineProperty(exports2, "escapeText", { enumerable: true, get: function() {
      return escape_js_2.escapeText;
    } });
    var encode_js_2 = require_encode();
    Object.defineProperty(exports2, "encodeHTML", { enumerable: true, get: function() {
      return encode_js_2.encodeHTML;
    } });
    Object.defineProperty(exports2, "encodeNonAsciiHTML", { enumerable: true, get: function() {
      return encode_js_2.encodeNonAsciiHTML;
    } });
    Object.defineProperty(exports2, "encodeHTML4", { enumerable: true, get: function() {
      return encode_js_2.encodeHTML;
    } });
    Object.defineProperty(exports2, "encodeHTML5", { enumerable: true, get: function() {
      return encode_js_2.encodeHTML;
    } });
    var decode_js_2 = require_decode();
    Object.defineProperty(exports2, "EntityDecoder", { enumerable: true, get: function() {
      return decode_js_2.EntityDecoder;
    } });
    Object.defineProperty(exports2, "DecodingMode", { enumerable: true, get: function() {
      return decode_js_2.DecodingMode;
    } });
    Object.defineProperty(exports2, "decodeXML", { enumerable: true, get: function() {
      return decode_js_2.decodeXML;
    } });
    Object.defineProperty(exports2, "decodeHTML", { enumerable: true, get: function() {
      return decode_js_2.decodeHTML;
    } });
    Object.defineProperty(exports2, "decodeHTMLStrict", { enumerable: true, get: function() {
      return decode_js_2.decodeHTMLStrict;
    } });
    Object.defineProperty(exports2, "decodeHTMLAttribute", { enumerable: true, get: function() {
      return decode_js_2.decodeHTMLAttribute;
    } });
    Object.defineProperty(exports2, "decodeHTML4", { enumerable: true, get: function() {
      return decode_js_2.decodeHTML;
    } });
    Object.defineProperty(exports2, "decodeHTML5", { enumerable: true, get: function() {
      return decode_js_2.decodeHTML;
    } });
    Object.defineProperty(exports2, "decodeHTML4Strict", { enumerable: true, get: function() {
      return decode_js_2.decodeHTMLStrict;
    } });
    Object.defineProperty(exports2, "decodeHTML5Strict", { enumerable: true, get: function() {
      return decode_js_2.decodeHTMLStrict;
    } });
    Object.defineProperty(exports2, "decodeXMLStrict", { enumerable: true, get: function() {
      return decode_js_2.decodeXML;
    } });
  }
});

// node_modules/.pnpm/linkify-it@5.0.2/node_modules/linkify-it/build/index.cjs.js
var require_index_cjs3 = __commonJS({
  "node_modules/.pnpm/linkify-it@5.0.2/node_modules/linkify-it/build/index.cjs.js"(exports2, module2) {
    "use strict";
    var uc_micro = require_index_cjs2();
    function reFactory(opts) {
      const re = {};
      opts = opts || {};
      re.src_Any = uc_micro.Any.source;
      re.src_Cc = uc_micro.Cc.source;
      re.src_Z = uc_micro.Z.source;
      re.src_P = uc_micro.P.source;
      re.src_ZPCc = [re.src_Z, re.src_P, re.src_Cc].join("|");
      re.src_ZCc = [re.src_Z, re.src_Cc].join("|");
      const text_separators = "[><\uFF5C]";
      re.src_pseudo_letter = `(?:(?!${text_separators}|${re.src_ZPCc})${re.src_Any})`;
      re.src_ip4 = "(?:(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)";
      re.src_auth = `(?:(?:(?!${re.src_ZCc}|[@/\\[\\]()]).){1,50}@)?`;
      re.src_port = "(?::(?:6(?:[0-4]\\d{3}|5(?:[0-4]\\d{2}|5(?:[0-2]\\d|3[0-5])))|[1-5]?\\d{1,4}))?";
      re.src_host_terminator = `(?=$|${text_separators}|${re.src_ZPCc})(?!${opts["---"] ? "-(?!--)|" : "-|"}_|:\\d|\\.-|\\.(?!$|${re.src_ZPCc}))`;
      re.src_path = `(?:[/?#](?:(?!${re.src_ZCc}|${text_separators}|[()[\\]{}.,"'?!\\-;]).|\\[(?:(?!${re.src_ZCc}|\\]).)*\\]|\\((?:(?!${re.src_ZCc}|[)]).)*\\)|\\{(?:(?!${re.src_ZCc}|[}]).)*\\}|\\"(?:(?!${re.src_ZCc}|["]).)+\\"|\\'(?:(?!${re.src_ZCc}|[']).)+\\'|\\'(?=${re.src_pseudo_letter}|[-])|\\.{2,}[a-zA-Z0-9%/&]|\\.(?!${re.src_ZCc}|[.]|$)|` + (opts["---"] ? "\\-(?!--(?:[^-]|$))(?:-*)|" : "\\-+|") + // allow `,,,` in paths
      `,(?!${re.src_ZCc}|$)|;(?!${re.src_ZCc}|$)|\\!+(?!${re.src_ZCc}|[!]|$)|\\?(?!${re.src_ZCc}|[?]|$))+|\\/)?`;
      re.src_email_name = '[\\-;:&=\\+\\$,\\.a-zA-Z0-9_][\\-;:&=\\+\\$,\\"\\.a-zA-Z0-9_]{0,63}';
      re.src_xn = "xn--[a-z0-9\\-]{1,59}";
      re.src_domain_root = // Allow letters & digits (http://test1)
      "(?:" + re.src_xn + `|${re.src_pseudo_letter}{1,63})`;
      re.src_domain = "(?:" + re.src_xn + `|(?:${re.src_pseudo_letter})|(?:${re.src_pseudo_letter}(?:-|${re.src_pseudo_letter}){0,61}${re.src_pseudo_letter}))`;
      re.src_host = `(?:(?:(?:(?:${re.src_domain})\\.)*${re.src_domain}))`;
      re.tpl_host_fuzzy = "(?:" + re.src_ip4 + `|(?:(?:(?:${re.src_domain})\\.)+(?:%TLDS%)))`;
      re.tpl_host_no_ip_fuzzy = `(?:(?:(?:${re.src_domain})\\.)+(?:%TLDS%))`;
      re.src_host_strict = re.src_host + re.src_host_terminator;
      re.tpl_host_fuzzy_strict = re.tpl_host_fuzzy + re.src_host_terminator;
      re.src_host_port_strict = re.src_host + re.src_port + re.src_host_terminator;
      re.tpl_host_port_fuzzy_strict = re.tpl_host_fuzzy + re.src_port + re.src_host_terminator;
      re.tpl_host_port_no_ip_fuzzy_strict = re.tpl_host_no_ip_fuzzy + re.src_port + re.src_host_terminator;
      re.tpl_host_fuzzy_test = `localhost|www\\.|\\.\\d{1,3}\\.|(?:\\.(?:%TLDS%)(?:${re.src_ZPCc}|>|$))`;
      re.tpl_email_fuzzy = `(^|${text_separators}|"|\\(|${re.src_ZCc})(${re.src_email_name}@${re.tpl_host_fuzzy_strict})`;
      re.tpl_link_fuzzy = // Fuzzy link can't be prepended with .:/\- and non punctuation.
      // but can start with > (markdown blockquote)
      `(^|(?![.:/\\-_@])(?:[$+<=>^\`|\uFF5C]|${re.src_ZPCc}))((?![$+<=>^\`|\uFF5C])${re.tpl_host_port_fuzzy_strict}${re.src_path})`;
      re.tpl_link_no_ip_fuzzy = // Fuzzy link can't be prepended with .:/\- and non punctuation.
      // but can start with > (markdown blockquote)
      `(^|(?![.:/\\-_@])(?:[$+<=>^\`|\uFF5C]|${re.src_ZPCc}))((?![$+<=>^\`|\uFF5C])${re.tpl_host_port_no_ip_fuzzy_strict}${re.src_path})`;
      return re;
    }
    function assign(obj) {
      const sources = Array.prototype.slice.call(arguments, 1);
      sources.forEach(function(source) {
        if (!source) {
          return;
        }
        Object.keys(source).forEach(function(key) {
          obj[key] = source[key];
        });
      });
      return obj;
    }
    function _class(obj) {
      return Object.prototype.toString.call(obj);
    }
    function isString(obj) {
      return _class(obj) === "[object String]";
    }
    function isObject(obj) {
      return _class(obj) === "[object Object]";
    }
    function isRegExp(obj) {
      return _class(obj) === "[object RegExp]";
    }
    function isFunction(obj) {
      return _class(obj) === "[object Function]";
    }
    function escapeRE(str) {
      return str.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&");
    }
    var defaultOptions = {
      fuzzyLink: true,
      fuzzyEmail: true,
      fuzzyIP: false
    };
    function isOptionsObj(obj) {
      return Object.keys(obj || {}).reduce(function(acc, k) {
        return acc || defaultOptions.hasOwnProperty(k);
      }, false);
    }
    var defaultSchemas = {
      "http:": {
        validate: function(text, pos, self) {
          const tail = text.slice(pos);
          if (!self.re.http) {
            self.re.http = new RegExp(
              `^\\/\\/${self.re.src_auth}${self.re.src_host_port_strict}${self.re.src_path}`,
              "i"
            );
          }
          if (self.re.http.test(tail)) {
            return tail.match(self.re.http)[0].length;
          }
          return 0;
        }
      },
      "https:": "http:",
      "ftp:": "http:",
      "//": {
        validate: function(text, pos, self) {
          const tail = text.slice(pos);
          if (!self.re.no_http) {
            self.re.no_http = new RegExp(
              "^" + self.re.src_auth + // Don't allow single-level domains, because of false positives like '//test'
              // with code comments
              `(?:localhost|(?:(?:${self.re.src_domain})\\.)+${self.re.src_domain_root})` + self.re.src_port + self.re.src_host_terminator + self.re.src_path,
              "i"
            );
          }
          if (self.re.no_http.test(tail)) {
            if (pos >= 3 && text[pos - 3] === ":") {
              return 0;
            }
            if (pos >= 3 && text[pos - 3] === "/") {
              return 0;
            }
            return tail.match(self.re.no_http)[0].length;
          }
          return 0;
        }
      },
      "mailto:": {
        validate: function(text, pos, self) {
          const tail = text.slice(pos);
          if (!self.re.mailto) {
            self.re.mailto = new RegExp(
              `^${self.re.src_email_name}@${self.re.src_host_strict}`,
              "i"
            );
          }
          if (self.re.mailto.test(tail)) {
            return tail.match(self.re.mailto)[0].length;
          }
          return 0;
        }
      }
    };
    var tlds_2ch_src_re = "a[cdefgilmnoqrstuwxz]|b[abdefghijmnorstvwyz]|c[acdfghiklmnoruvwxyz]|d[ejkmoz]|e[cegrstu]|f[ijkmor]|g[abdefghilmnpqrstuwy]|h[kmnrtu]|i[delmnoqrst]|j[emop]|k[eghimnprwyz]|l[abcikrstuvy]|m[acdeghklmnopqrstuvwxyz]|n[acefgilopruz]|om|p[aefghklmnrstwy]|qa|r[eosuw]|s[abcdeghijklmnortuvxyz]|t[cdfghjklmnortvwz]|u[agksyz]|v[aceginu]|w[fs]|y[et]|z[amw]";
    var tlds_default = "biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|\u0440\u0444".split("|");
    function createValidator(re) {
      return function(text, pos) {
        const tail = text.slice(pos);
        if (re.test(tail)) {
          return tail.match(re)[0].length;
        }
        return 0;
      };
    }
    function createNormalizer() {
      return function(match, self) {
        self.normalize(match);
      };
    }
    function compile(self) {
      const re = self.re = reFactory(self.__opts__);
      const tlds = self.__tlds__.slice();
      self.onCompile();
      if (!self.__tlds_replaced__) {
        tlds.push(tlds_2ch_src_re);
      }
      tlds.push(re.src_xn);
      re.src_tlds = tlds.join("|");
      function untpl(tpl) {
        return tpl.replace("%TLDS%", re.src_tlds);
      }
      re.email_fuzzy = RegExp(untpl(re.tpl_email_fuzzy), "i");
      re.email_fuzzy_global = RegExp(untpl(re.tpl_email_fuzzy), "ig");
      re.link_fuzzy = RegExp(untpl(re.tpl_link_fuzzy), "i");
      re.link_fuzzy_global = RegExp(untpl(re.tpl_link_fuzzy), "ig");
      re.link_no_ip_fuzzy = RegExp(untpl(re.tpl_link_no_ip_fuzzy), "i");
      re.link_no_ip_fuzzy_global = RegExp(untpl(re.tpl_link_no_ip_fuzzy), "ig");
      re.host_fuzzy_test = RegExp(untpl(re.tpl_host_fuzzy_test), "i");
      const aliases = [];
      self.__compiled__ = {};
      function schemaError(name, val) {
        throw new Error(`(LinkifyIt) Invalid schema "${name}": ${val}`);
      }
      Object.keys(self.__schemas__).forEach(function(name) {
        const val = self.__schemas__[name];
        if (val === null) {
          return;
        }
        const compiled = { validate: null, link: null };
        self.__compiled__[name] = compiled;
        if (isObject(val)) {
          if (isRegExp(val.validate)) {
            compiled.validate = createValidator(val.validate);
          } else if (isFunction(val.validate)) {
            compiled.validate = val.validate;
          } else {
            schemaError(name, val);
          }
          if (isFunction(val.normalize)) {
            compiled.normalize = val.normalize;
          } else if (!val.normalize) {
            compiled.normalize = createNormalizer();
          } else {
            schemaError(name, val);
          }
          return;
        }
        if (isString(val)) {
          aliases.push(name);
          return;
        }
        schemaError(name, val);
      });
      aliases.forEach(function(alias) {
        if (!self.__compiled__[self.__schemas__[alias]]) {
          return;
        }
        self.__compiled__[alias].validate = self.__compiled__[self.__schemas__[alias]].validate;
        self.__compiled__[alias].normalize = self.__compiled__[self.__schemas__[alias]].normalize;
      });
      self.__compiled__[""] = { validate: null, normalize: createNormalizer() };
      const slist = Object.keys(self.__compiled__).filter(function(name) {
        return name.length > 0 && self.__compiled__[name];
      }).map(escapeRE).join("|");
      self.re.schema_test = RegExp(`(^|(?!_)(?:[><\uFF5C]|${re.src_ZPCc}))(${slist})`, "i");
      self.re.schema_search = RegExp(`(^|(?!_)(?:[><\uFF5C]|${re.src_ZPCc}))(${slist})`, "ig");
      self.re.schema_at_start = RegExp(`^${self.re.schema_search.source}`, "i");
      self.re.pretest = RegExp(
        `(${self.re.schema_test.source})|(${self.re.host_fuzzy_test.source})|@`,
        "i"
      );
    }
    function Match(text, schema, index, lastIndex) {
      const raw = text.slice(index, lastIndex);
      this.schema = schema.toLowerCase();
      this.index = index;
      this.lastIndex = lastIndex;
      this.raw = raw;
      this.text = raw;
      this.url = raw;
    }
    function LinkifyIt(schemas, options) {
      if (!(this instanceof LinkifyIt)) {
        return new LinkifyIt(schemas, options);
      }
      if (!options) {
        if (isOptionsObj(schemas)) {
          options = schemas;
          schemas = {};
        }
      }
      this.__opts__ = assign({}, defaultOptions, options);
      this.__schemas__ = assign({}, defaultSchemas, schemas);
      this.__compiled__ = {};
      this.__tlds__ = tlds_default;
      this.__tlds_replaced__ = false;
      this.re = {};
      compile(this);
    }
    LinkifyIt.prototype.add = function add(schema, definition) {
      this.__schemas__[schema] = definition;
      compile(this);
      return this;
    };
    LinkifyIt.prototype.set = function set(options) {
      this.__opts__ = assign(this.__opts__, options);
      return this;
    };
    LinkifyIt.prototype.test = function test(text) {
      if (!text.length) {
        return false;
      }
      let m, re;
      if (this.re.schema_test.test(text)) {
        re = this.re.schema_search;
        re.lastIndex = 0;
        while ((m = re.exec(text)) !== null) {
          if (this.testSchemaAt(text, m[2], re.lastIndex)) {
            return true;
          }
        }
      }
      if (this.__opts__.fuzzyLink && this.__compiled__["http:"]) {
        if (text.search(this.re.host_fuzzy_test) >= 0) {
          if (text.match(this.__opts__.fuzzyIP ? this.re.link_fuzzy : this.re.link_no_ip_fuzzy) !== null) {
            return true;
          }
        }
      }
      if (this.__opts__.fuzzyEmail && this.__compiled__["mailto:"]) {
        if (text.indexOf("@") >= 0) {
          if (text.match(this.re.email_fuzzy) !== null) {
            return true;
          }
        }
      }
      return false;
    };
    LinkifyIt.prototype.pretest = function pretest(text) {
      return this.re.pretest.test(text);
    };
    LinkifyIt.prototype.testSchemaAt = function testSchemaAt(text, schema, pos) {
      if (!this.__compiled__[schema.toLowerCase()]) {
        return 0;
      }
      return this.__compiled__[schema.toLowerCase()].validate(text, pos, this);
    };
    LinkifyIt.prototype.match = function match(text) {
      const result = [];
      const type_schemed = [];
      const type_fuzzy_link = [];
      const type_fuzzy_email = [];
      let m, len, re;
      function choose(a, b) {
        if (!a) {
          return b;
        }
        if (!b) {
          return a;
        }
        if (a.index !== b.index) {
          return a.index < b.index ? a : b;
        }
        return a.lastIndex >= b.lastIndex ? a : b;
      }
      if (!text.length) {
        return null;
      }
      if (this.re.schema_test.test(text)) {
        re = this.re.schema_search;
        re.lastIndex = 0;
        while ((m = re.exec(text)) !== null) {
          len = this.testSchemaAt(text, m[2], re.lastIndex);
          if (len) {
            type_schemed.push({
              schema: m[2],
              index: m.index + m[1].length,
              lastIndex: m.index + m[0].length + len
            });
          }
        }
      }
      if (this.__opts__.fuzzyLink && this.__compiled__["http:"]) {
        re = this.__opts__.fuzzyIP ? this.re.link_fuzzy_global : this.re.link_no_ip_fuzzy_global;
        re.lastIndex = 0;
        while ((m = re.exec(text)) !== null) {
          type_fuzzy_link.push({
            schema: "",
            index: m.index + m[1].length,
            lastIndex: m.index + m[0].length
          });
        }
      }
      if (this.__opts__.fuzzyEmail && this.__compiled__["mailto:"]) {
        re = this.re.email_fuzzy_global;
        re.lastIndex = 0;
        while ((m = re.exec(text)) !== null) {
          type_fuzzy_email.push({
            schema: "mailto:",
            index: m.index + m[1].length,
            lastIndex: m.index + m[0].length
          });
        }
      }
      const indexes = [0, 0, 0];
      let lastIndex = 0;
      for (; ; ) {
        const candidates = [
          type_schemed[indexes[0]],
          type_fuzzy_email[indexes[1]],
          type_fuzzy_link[indexes[2]]
        ];
        const candidate = choose(choose(candidates[0], candidates[1]), candidates[2]);
        if (!candidate) {
          break;
        }
        if (candidate === candidates[0]) {
          indexes[0]++;
        } else if (candidate === candidates[1]) {
          indexes[1]++;
        } else {
          indexes[2]++;
        }
        if (candidate.index < lastIndex) {
          continue;
        }
        const match2 = new Match(text, candidate.schema, candidate.index, candidate.lastIndex);
        this.__compiled__[match2.schema].normalize(match2, this);
        result.push(match2);
        lastIndex = candidate.lastIndex;
      }
      if (result.length) {
        return result;
      }
      return null;
    };
    LinkifyIt.prototype.matchAtStart = function matchAtStart(text) {
      if (!text.length) return null;
      const m = this.re.schema_at_start.exec(text);
      if (!m) return null;
      const len = this.testSchemaAt(text, m[2], m[0].length);
      if (!len) return null;
      const match = new Match(text, m[2], m.index + m[1].length, m.index + m[0].length + len);
      this.__compiled__[match.schema].normalize(match, this);
      return match;
    };
    LinkifyIt.prototype.tlds = function tlds(list, keepOld) {
      list = Array.isArray(list) ? list : [list];
      if (!keepOld) {
        this.__tlds__ = list.slice();
        this.__tlds_replaced__ = true;
        compile(this);
        return this;
      }
      this.__tlds__ = this.__tlds__.concat(list).sort().filter(function(el, idx, arr) {
        return el !== arr[idx - 1];
      }).reverse();
      compile(this);
      return this;
    };
    LinkifyIt.prototype.normalize = function normalize(match) {
      if (!match.schema) {
        match.url = `http://${match.url}`;
      }
      if (match.schema === "mailto:" && !/^mailto:/i.test(match.url)) {
        match.url = `mailto:${match.url}`;
      }
    };
    LinkifyIt.prototype.onCompile = function onCompile() {
    };
    module2.exports = LinkifyIt;
  }
});

// node_modules/.pnpm/punycode.js@2.3.1/node_modules/punycode.js/punycode.js
var require_punycode = __commonJS({
  "node_modules/.pnpm/punycode.js@2.3.1/node_modules/punycode.js/punycode.js"(exports2, module2) {
    "use strict";
    var maxInt = 2147483647;
    var base = 36;
    var tMin = 1;
    var tMax = 26;
    var skew = 38;
    var damp = 700;
    var initialBias = 72;
    var initialN = 128;
    var delimiter = "-";
    var regexPunycode = /^xn--/;
    var regexNonASCII = /[^\0-\x7F]/;
    var regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g;
    var errors = {
      "overflow": "Overflow: input needs wider integers to process",
      "not-basic": "Illegal input >= 0x80 (not a basic code point)",
      "invalid-input": "Invalid input"
    };
    var baseMinusTMin = base - tMin;
    var floor = Math.floor;
    var stringFromCharCode = String.fromCharCode;
    function error(type) {
      throw new RangeError(errors[type]);
    }
    function map(array, callback) {
      const result = [];
      let length = array.length;
      while (length--) {
        result[length] = callback(array[length]);
      }
      return result;
    }
    function mapDomain(domain, callback) {
      const parts = domain.split("@");
      let result = "";
      if (parts.length > 1) {
        result = parts[0] + "@";
        domain = parts[1];
      }
      domain = domain.replace(regexSeparators, ".");
      const labels = domain.split(".");
      const encoded = map(labels, callback).join(".");
      return result + encoded;
    }
    function ucs2decode(string) {
      const output = [];
      let counter = 0;
      const length = string.length;
      while (counter < length) {
        const value = string.charCodeAt(counter++);
        if (value >= 55296 && value <= 56319 && counter < length) {
          const extra = string.charCodeAt(counter++);
          if ((extra & 64512) == 56320) {
            output.push(((value & 1023) << 10) + (extra & 1023) + 65536);
          } else {
            output.push(value);
            counter--;
          }
        } else {
          output.push(value);
        }
      }
      return output;
    }
    var ucs2encode = (codePoints) => String.fromCodePoint(...codePoints);
    var basicToDigit = function(codePoint) {
      if (codePoint >= 48 && codePoint < 58) {
        return 26 + (codePoint - 48);
      }
      if (codePoint >= 65 && codePoint < 91) {
        return codePoint - 65;
      }
      if (codePoint >= 97 && codePoint < 123) {
        return codePoint - 97;
      }
      return base;
    };
    var digitToBasic = function(digit, flag) {
      return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
    };
    var adapt = function(delta, numPoints, firstTime) {
      let k = 0;
      delta = firstTime ? floor(delta / damp) : delta >> 1;
      delta += floor(delta / numPoints);
      for (; delta > baseMinusTMin * tMax >> 1; k += base) {
        delta = floor(delta / baseMinusTMin);
      }
      return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
    };
    var decode = function(input) {
      const output = [];
      const inputLength = input.length;
      let i = 0;
      let n = initialN;
      let bias = initialBias;
      let basic = input.lastIndexOf(delimiter);
      if (basic < 0) {
        basic = 0;
      }
      for (let j = 0; j < basic; ++j) {
        if (input.charCodeAt(j) >= 128) {
          error("not-basic");
        }
        output.push(input.charCodeAt(j));
      }
      for (let index = basic > 0 ? basic + 1 : 0; index < inputLength; ) {
        const oldi = i;
        for (let w = 1, k = base; ; k += base) {
          if (index >= inputLength) {
            error("invalid-input");
          }
          const digit = basicToDigit(input.charCodeAt(index++));
          if (digit >= base) {
            error("invalid-input");
          }
          if (digit > floor((maxInt - i) / w)) {
            error("overflow");
          }
          i += digit * w;
          const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
          if (digit < t) {
            break;
          }
          const baseMinusT = base - t;
          if (w > floor(maxInt / baseMinusT)) {
            error("overflow");
          }
          w *= baseMinusT;
        }
        const out = output.length + 1;
        bias = adapt(i - oldi, out, oldi == 0);
        if (floor(i / out) > maxInt - n) {
          error("overflow");
        }
        n += floor(i / out);
        i %= out;
        output.splice(i++, 0, n);
      }
      return String.fromCodePoint(...output);
    };
    var encode = function(input) {
      const output = [];
      input = ucs2decode(input);
      const inputLength = input.length;
      let n = initialN;
      let delta = 0;
      let bias = initialBias;
      for (const currentValue of input) {
        if (currentValue < 128) {
          output.push(stringFromCharCode(currentValue));
        }
      }
      const basicLength = output.length;
      let handledCPCount = basicLength;
      if (basicLength) {
        output.push(delimiter);
      }
      while (handledCPCount < inputLength) {
        let m = maxInt;
        for (const currentValue of input) {
          if (currentValue >= n && currentValue < m) {
            m = currentValue;
          }
        }
        const handledCPCountPlusOne = handledCPCount + 1;
        if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
          error("overflow");
        }
        delta += (m - n) * handledCPCountPlusOne;
        n = m;
        for (const currentValue of input) {
          if (currentValue < n && ++delta > maxInt) {
            error("overflow");
          }
          if (currentValue === n) {
            let q = delta;
            for (let k = base; ; k += base) {
              const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
              if (q < t) {
                break;
              }
              const qMinusT = q - t;
              const baseMinusT = base - t;
              output.push(
                stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
              );
              q = floor(qMinusT / baseMinusT);
            }
            output.push(stringFromCharCode(digitToBasic(q, 0)));
            bias = adapt(delta, handledCPCountPlusOne, handledCPCount === basicLength);
            delta = 0;
            ++handledCPCount;
          }
        }
        ++delta;
        ++n;
      }
      return output.join("");
    };
    var toUnicode = function(input) {
      return mapDomain(input, function(string) {
        return regexPunycode.test(string) ? decode(string.slice(4).toLowerCase()) : string;
      });
    };
    var toASCII = function(input) {
      return mapDomain(input, function(string) {
        return regexNonASCII.test(string) ? "xn--" + encode(string) : string;
      });
    };
    var punycode = {
      /**
       * A string representing the current Punycode.js version number.
       * @memberOf punycode
       * @type String
       */
      "version": "2.3.1",
      /**
       * An object of methods to convert from JavaScript's internal character
       * representation (UCS-2) to Unicode code points, and back.
       * @see <https://mathiasbynens.be/notes/javascript-encoding>
       * @memberOf punycode
       * @type Object
       */
      "ucs2": {
        "decode": ucs2decode,
        "encode": ucs2encode
      },
      "decode": decode,
      "encode": encode,
      "toASCII": toASCII,
      "toUnicode": toUnicode
    };
    module2.exports = punycode;
  }
});

// node_modules/.pnpm/markdown-it@14.1.1/node_modules/markdown-it/dist/index.cjs.js
var require_index_cjs4 = __commonJS({
  "node_modules/.pnpm/markdown-it@14.1.1/node_modules/markdown-it/dist/index.cjs.js"(exports2, module2) {
    "use strict";
    var mdurl = require_index_cjs();
    var ucmicro = require_index_cjs2();
    var entities = require_lib();
    var LinkifyIt = require_index_cjs3();
    var punycode = require_punycode();
    function _interopNamespaceDefault(e) {
      var n = /* @__PURE__ */ Object.create(null);
      if (e) {
        Object.keys(e).forEach(function(k) {
          if (k !== "default") {
            var d = Object.getOwnPropertyDescriptor(e, k);
            Object.defineProperty(n, k, d.get ? d : {
              enumerable: true,
              get: function() {
                return e[k];
              }
            });
          }
        });
      }
      n.default = e;
      return Object.freeze(n);
    }
    var mdurl__namespace = /* @__PURE__ */ _interopNamespaceDefault(mdurl);
    var ucmicro__namespace = /* @__PURE__ */ _interopNamespaceDefault(ucmicro);
    function _class(obj) {
      return Object.prototype.toString.call(obj);
    }
    function isString(obj) {
      return _class(obj) === "[object String]";
    }
    var _hasOwnProperty = Object.prototype.hasOwnProperty;
    function has(object, key) {
      return _hasOwnProperty.call(object, key);
    }
    function assign(obj) {
      const sources = Array.prototype.slice.call(arguments, 1);
      sources.forEach(function(source) {
        if (!source) {
          return;
        }
        if (typeof source !== "object") {
          throw new TypeError(source + "must be object");
        }
        Object.keys(source).forEach(function(key) {
          obj[key] = source[key];
        });
      });
      return obj;
    }
    function arrayReplaceAt(src, pos, newElements) {
      return [].concat(src.slice(0, pos), newElements, src.slice(pos + 1));
    }
    function isValidEntityCode(c) {
      if (c >= 55296 && c <= 57343) {
        return false;
      }
      if (c >= 64976 && c <= 65007) {
        return false;
      }
      if ((c & 65535) === 65535 || (c & 65535) === 65534) {
        return false;
      }
      if (c >= 0 && c <= 8) {
        return false;
      }
      if (c === 11) {
        return false;
      }
      if (c >= 14 && c <= 31) {
        return false;
      }
      if (c >= 127 && c <= 159) {
        return false;
      }
      if (c > 1114111) {
        return false;
      }
      return true;
    }
    function fromCodePoint(c) {
      if (c > 65535) {
        c -= 65536;
        const surrogate1 = 55296 + (c >> 10);
        const surrogate2 = 56320 + (c & 1023);
        return String.fromCharCode(surrogate1, surrogate2);
      }
      return String.fromCharCode(c);
    }
    var UNESCAPE_MD_RE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;
    var ENTITY_RE = /&([a-z#][a-z0-9]{1,31});/gi;
    var UNESCAPE_ALL_RE = new RegExp(UNESCAPE_MD_RE.source + "|" + ENTITY_RE.source, "gi");
    var DIGITAL_ENTITY_TEST_RE = /^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))$/i;
    function replaceEntityPattern(match, name) {
      if (name.charCodeAt(0) === 35 && DIGITAL_ENTITY_TEST_RE.test(name)) {
        const code2 = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        if (isValidEntityCode(code2)) {
          return fromCodePoint(code2);
        }
        return match;
      }
      const decoded = entities.decodeHTML(match);
      if (decoded !== match) {
        return decoded;
      }
      return match;
    }
    function unescapeMd(str) {
      if (str.indexOf("\\") < 0) {
        return str;
      }
      return str.replace(UNESCAPE_MD_RE, "$1");
    }
    function unescapeAll(str) {
      if (str.indexOf("\\") < 0 && str.indexOf("&") < 0) {
        return str;
      }
      return str.replace(UNESCAPE_ALL_RE, function(match, escaped, entity2) {
        if (escaped) {
          return escaped;
        }
        return replaceEntityPattern(match, entity2);
      });
    }
    var HTML_ESCAPE_TEST_RE = /[&<>"]/;
    var HTML_ESCAPE_REPLACE_RE = /[&<>"]/g;
    var HTML_REPLACEMENTS = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    };
    function replaceUnsafeChar(ch) {
      return HTML_REPLACEMENTS[ch];
    }
    function escapeHtml(str) {
      if (HTML_ESCAPE_TEST_RE.test(str)) {
        return str.replace(HTML_ESCAPE_REPLACE_RE, replaceUnsafeChar);
      }
      return str;
    }
    var REGEXP_ESCAPE_RE = /[.?*+^$[\]\\(){}|-]/g;
    function escapeRE(str) {
      return str.replace(REGEXP_ESCAPE_RE, "\\$&");
    }
    function isSpace(code2) {
      switch (code2) {
        case 9:
        case 32:
          return true;
      }
      return false;
    }
    function isWhiteSpace(code2) {
      if (code2 >= 8192 && code2 <= 8202) {
        return true;
      }
      switch (code2) {
        case 9:
        // \t
        case 10:
        // \n
        case 11:
        // \v
        case 12:
        // \f
        case 13:
        // \r
        case 32:
        case 160:
        case 5760:
        case 8239:
        case 8287:
        case 12288:
          return true;
      }
      return false;
    }
    function isPunctChar(ch) {
      return ucmicro__namespace.P.test(ch) || ucmicro__namespace.S.test(ch);
    }
    function isMdAsciiPunct(ch) {
      switch (ch) {
        case 33:
        case 34:
        case 35:
        case 36:
        case 37:
        case 38:
        case 39:
        case 40:
        case 41:
        case 42:
        case 43:
        case 44:
        case 45:
        case 46:
        case 47:
        case 58:
        case 59:
        case 60:
        case 61:
        case 62:
        case 63:
        case 64:
        case 91:
        case 92:
        case 93:
        case 94:
        case 95:
        case 96:
        case 123:
        case 124:
        case 125:
        case 126:
          return true;
        default:
          return false;
      }
    }
    function normalizeReference(str) {
      str = str.trim().replace(/\s+/g, " ");
      if ("\u1E9E".toLowerCase() === "\u1E7E") {
        str = str.replace(/ẞ/g, "\xDF");
      }
      return str.toLowerCase().toUpperCase();
    }
    var lib = {
      mdurl: mdurl__namespace,
      ucmicro: ucmicro__namespace
    };
    var utils = /* @__PURE__ */ Object.freeze({
      __proto__: null,
      arrayReplaceAt,
      assign,
      escapeHtml,
      escapeRE,
      fromCodePoint,
      has,
      isMdAsciiPunct,
      isPunctChar,
      isSpace,
      isString,
      isValidEntityCode,
      isWhiteSpace,
      lib,
      normalizeReference,
      unescapeAll,
      unescapeMd
    });
    function parseLinkLabel(state, start, disableNested) {
      let level, found, marker, prevPos;
      const max = state.posMax;
      const oldPos = state.pos;
      state.pos = start + 1;
      level = 1;
      while (state.pos < max) {
        marker = state.src.charCodeAt(state.pos);
        if (marker === 93) {
          level--;
          if (level === 0) {
            found = true;
            break;
          }
        }
        prevPos = state.pos;
        state.md.inline.skipToken(state);
        if (marker === 91) {
          if (prevPos === state.pos - 1) {
            level++;
          } else if (disableNested) {
            state.pos = oldPos;
            return -1;
          }
        }
      }
      let labelEnd = -1;
      if (found) {
        labelEnd = state.pos;
      }
      state.pos = oldPos;
      return labelEnd;
    }
    function parseLinkDestination(str, start, max) {
      let code2;
      let pos = start;
      const result = {
        ok: false,
        pos: 0,
        str: ""
      };
      if (str.charCodeAt(pos) === 60) {
        pos++;
        while (pos < max) {
          code2 = str.charCodeAt(pos);
          if (code2 === 10) {
            return result;
          }
          if (code2 === 60) {
            return result;
          }
          if (code2 === 62) {
            result.pos = pos + 1;
            result.str = unescapeAll(str.slice(start + 1, pos));
            result.ok = true;
            return result;
          }
          if (code2 === 92 && pos + 1 < max) {
            pos += 2;
            continue;
          }
          pos++;
        }
        return result;
      }
      let level = 0;
      while (pos < max) {
        code2 = str.charCodeAt(pos);
        if (code2 === 32) {
          break;
        }
        if (code2 < 32 || code2 === 127) {
          break;
        }
        if (code2 === 92 && pos + 1 < max) {
          if (str.charCodeAt(pos + 1) === 32) {
            break;
          }
          pos += 2;
          continue;
        }
        if (code2 === 40) {
          level++;
          if (level > 32) {
            return result;
          }
        }
        if (code2 === 41) {
          if (level === 0) {
            break;
          }
          level--;
        }
        pos++;
      }
      if (start === pos) {
        return result;
      }
      if (level !== 0) {
        return result;
      }
      result.str = unescapeAll(str.slice(start, pos));
      result.pos = pos;
      result.ok = true;
      return result;
    }
    function parseLinkTitle(str, start, max, prev_state) {
      let code2;
      let pos = start;
      const state = {
        // if `true`, this is a valid link title
        ok: false,
        // if `true`, this link can be continued on the next line
        can_continue: false,
        // if `ok`, it's the position of the first character after the closing marker
        pos: 0,
        // if `ok`, it's the unescaped title
        str: "",
        // expected closing marker character code
        marker: 0
      };
      if (prev_state) {
        state.str = prev_state.str;
        state.marker = prev_state.marker;
      } else {
        if (pos >= max) {
          return state;
        }
        let marker = str.charCodeAt(pos);
        if (marker !== 34 && marker !== 39 && marker !== 40) {
          return state;
        }
        start++;
        pos++;
        if (marker === 40) {
          marker = 41;
        }
        state.marker = marker;
      }
      while (pos < max) {
        code2 = str.charCodeAt(pos);
        if (code2 === state.marker) {
          state.pos = pos + 1;
          state.str += unescapeAll(str.slice(start, pos));
          state.ok = true;
          return state;
        } else if (code2 === 40 && state.marker === 41) {
          return state;
        } else if (code2 === 92 && pos + 1 < max) {
          pos++;
        }
        pos++;
      }
      state.can_continue = true;
      state.str += unescapeAll(str.slice(start, pos));
      return state;
    }
    var helpers = /* @__PURE__ */ Object.freeze({
      __proto__: null,
      parseLinkDestination,
      parseLinkLabel,
      parseLinkTitle
    });
    var default_rules = {};
    default_rules.code_inline = function(tokens, idx, options, env, slf) {
      const token = tokens[idx];
      return "<code" + slf.renderAttrs(token) + ">" + escapeHtml(token.content) + "</code>";
    };
    default_rules.code_block = function(tokens, idx, options, env, slf) {
      const token = tokens[idx];
      return "<pre" + slf.renderAttrs(token) + "><code>" + escapeHtml(tokens[idx].content) + "</code></pre>\n";
    };
    default_rules.fence = function(tokens, idx, options, env, slf) {
      const token = tokens[idx];
      const info = token.info ? unescapeAll(token.info).trim() : "";
      let langName = "";
      let langAttrs = "";
      if (info) {
        const arr = info.split(/(\s+)/g);
        langName = arr[0];
        langAttrs = arr.slice(2).join("");
      }
      let highlighted;
      if (options.highlight) {
        highlighted = options.highlight(token.content, langName, langAttrs) || escapeHtml(token.content);
      } else {
        highlighted = escapeHtml(token.content);
      }
      if (highlighted.indexOf("<pre") === 0) {
        return highlighted + "\n";
      }
      if (info) {
        const i = token.attrIndex("class");
        const tmpAttrs = token.attrs ? token.attrs.slice() : [];
        if (i < 0) {
          tmpAttrs.push(["class", options.langPrefix + langName]);
        } else {
          tmpAttrs[i] = tmpAttrs[i].slice();
          tmpAttrs[i][1] += " " + options.langPrefix + langName;
        }
        const tmpToken = {
          attrs: tmpAttrs
        };
        return `<pre><code${slf.renderAttrs(tmpToken)}>${highlighted}</code></pre>
`;
      }
      return `<pre><code${slf.renderAttrs(token)}>${highlighted}</code></pre>
`;
    };
    default_rules.image = function(tokens, idx, options, env, slf) {
      const token = tokens[idx];
      token.attrs[token.attrIndex("alt")][1] = slf.renderInlineAsText(token.children, options, env);
      return slf.renderToken(tokens, idx, options);
    };
    default_rules.hardbreak = function(tokens, idx, options) {
      return options.xhtmlOut ? "<br />\n" : "<br>\n";
    };
    default_rules.softbreak = function(tokens, idx, options) {
      return options.breaks ? options.xhtmlOut ? "<br />\n" : "<br>\n" : "\n";
    };
    default_rules.text = function(tokens, idx) {
      return escapeHtml(tokens[idx].content);
    };
    default_rules.html_block = function(tokens, idx) {
      return tokens[idx].content;
    };
    default_rules.html_inline = function(tokens, idx) {
      return tokens[idx].content;
    };
    function Renderer() {
      this.rules = assign({}, default_rules);
    }
    Renderer.prototype.renderAttrs = function renderAttrs(token) {
      let i, l, result;
      if (!token.attrs) {
        return "";
      }
      result = "";
      for (i = 0, l = token.attrs.length; i < l; i++) {
        result += " " + escapeHtml(token.attrs[i][0]) + '="' + escapeHtml(token.attrs[i][1]) + '"';
      }
      return result;
    };
    Renderer.prototype.renderToken = function renderToken(tokens, idx, options) {
      const token = tokens[idx];
      let result = "";
      if (token.hidden) {
        return "";
      }
      if (token.block && token.nesting !== -1 && idx && tokens[idx - 1].hidden) {
        result += "\n";
      }
      result += (token.nesting === -1 ? "</" : "<") + token.tag;
      result += this.renderAttrs(token);
      if (token.nesting === 0 && options.xhtmlOut) {
        result += " /";
      }
      let needLf = false;
      if (token.block) {
        needLf = true;
        if (token.nesting === 1) {
          if (idx + 1 < tokens.length) {
            const nextToken = tokens[idx + 1];
            if (nextToken.type === "inline" || nextToken.hidden) {
              needLf = false;
            } else if (nextToken.nesting === -1 && nextToken.tag === token.tag) {
              needLf = false;
            }
          }
        }
      }
      result += needLf ? ">\n" : ">";
      return result;
    };
    Renderer.prototype.renderInline = function(tokens, options, env) {
      let result = "";
      const rules = this.rules;
      for (let i = 0, len = tokens.length; i < len; i++) {
        const type = tokens[i].type;
        if (typeof rules[type] !== "undefined") {
          result += rules[type](tokens, i, options, env, this);
        } else {
          result += this.renderToken(tokens, i, options);
        }
      }
      return result;
    };
    Renderer.prototype.renderInlineAsText = function(tokens, options, env) {
      let result = "";
      for (let i = 0, len = tokens.length; i < len; i++) {
        switch (tokens[i].type) {
          case "text":
            result += tokens[i].content;
            break;
          case "image":
            result += this.renderInlineAsText(tokens[i].children, options, env);
            break;
          case "html_inline":
          case "html_block":
            result += tokens[i].content;
            break;
          case "softbreak":
          case "hardbreak":
            result += "\n";
            break;
        }
      }
      return result;
    };
    Renderer.prototype.render = function(tokens, options, env) {
      let result = "";
      const rules = this.rules;
      for (let i = 0, len = tokens.length; i < len; i++) {
        const type = tokens[i].type;
        if (type === "inline") {
          result += this.renderInline(tokens[i].children, options, env);
        } else if (typeof rules[type] !== "undefined") {
          result += rules[type](tokens, i, options, env, this);
        } else {
          result += this.renderToken(tokens, i, options, env);
        }
      }
      return result;
    };
    function Ruler() {
      this.__rules__ = [];
      this.__cache__ = null;
    }
    Ruler.prototype.__find__ = function(name) {
      for (let i = 0; i < this.__rules__.length; i++) {
        if (this.__rules__[i].name === name) {
          return i;
        }
      }
      return -1;
    };
    Ruler.prototype.__compile__ = function() {
      const self = this;
      const chains = [""];
      self.__rules__.forEach(function(rule) {
        if (!rule.enabled) {
          return;
        }
        rule.alt.forEach(function(altName) {
          if (chains.indexOf(altName) < 0) {
            chains.push(altName);
          }
        });
      });
      self.__cache__ = {};
      chains.forEach(function(chain) {
        self.__cache__[chain] = [];
        self.__rules__.forEach(function(rule) {
          if (!rule.enabled) {
            return;
          }
          if (chain && rule.alt.indexOf(chain) < 0) {
            return;
          }
          self.__cache__[chain].push(rule.fn);
        });
      });
    };
    Ruler.prototype.at = function(name, fn, options) {
      const index = this.__find__(name);
      const opt = options || {};
      if (index === -1) {
        throw new Error("Parser rule not found: " + name);
      }
      this.__rules__[index].fn = fn;
      this.__rules__[index].alt = opt.alt || [];
      this.__cache__ = null;
    };
    Ruler.prototype.before = function(beforeName, ruleName, fn, options) {
      const index = this.__find__(beforeName);
      const opt = options || {};
      if (index === -1) {
        throw new Error("Parser rule not found: " + beforeName);
      }
      this.__rules__.splice(index, 0, {
        name: ruleName,
        enabled: true,
        fn,
        alt: opt.alt || []
      });
      this.__cache__ = null;
    };
    Ruler.prototype.after = function(afterName, ruleName, fn, options) {
      const index = this.__find__(afterName);
      const opt = options || {};
      if (index === -1) {
        throw new Error("Parser rule not found: " + afterName);
      }
      this.__rules__.splice(index + 1, 0, {
        name: ruleName,
        enabled: true,
        fn,
        alt: opt.alt || []
      });
      this.__cache__ = null;
    };
    Ruler.prototype.push = function(ruleName, fn, options) {
      const opt = options || {};
      this.__rules__.push({
        name: ruleName,
        enabled: true,
        fn,
        alt: opt.alt || []
      });
      this.__cache__ = null;
    };
    Ruler.prototype.enable = function(list2, ignoreInvalid) {
      if (!Array.isArray(list2)) {
        list2 = [list2];
      }
      const result = [];
      list2.forEach(function(name) {
        const idx = this.__find__(name);
        if (idx < 0) {
          if (ignoreInvalid) {
            return;
          }
          throw new Error("Rules manager: invalid rule name " + name);
        }
        this.__rules__[idx].enabled = true;
        result.push(name);
      }, this);
      this.__cache__ = null;
      return result;
    };
    Ruler.prototype.enableOnly = function(list2, ignoreInvalid) {
      if (!Array.isArray(list2)) {
        list2 = [list2];
      }
      this.__rules__.forEach(function(rule) {
        rule.enabled = false;
      });
      this.enable(list2, ignoreInvalid);
    };
    Ruler.prototype.disable = function(list2, ignoreInvalid) {
      if (!Array.isArray(list2)) {
        list2 = [list2];
      }
      const result = [];
      list2.forEach(function(name) {
        const idx = this.__find__(name);
        if (idx < 0) {
          if (ignoreInvalid) {
            return;
          }
          throw new Error("Rules manager: invalid rule name " + name);
        }
        this.__rules__[idx].enabled = false;
        result.push(name);
      }, this);
      this.__cache__ = null;
      return result;
    };
    Ruler.prototype.getRules = function(chainName) {
      if (this.__cache__ === null) {
        this.__compile__();
      }
      return this.__cache__[chainName] || [];
    };
    function Token(type, tag, nesting) {
      this.type = type;
      this.tag = tag;
      this.attrs = null;
      this.map = null;
      this.nesting = nesting;
      this.level = 0;
      this.children = null;
      this.content = "";
      this.markup = "";
      this.info = "";
      this.meta = null;
      this.block = false;
      this.hidden = false;
    }
    Token.prototype.attrIndex = function attrIndex(name) {
      if (!this.attrs) {
        return -1;
      }
      const attrs = this.attrs;
      for (let i = 0, len = attrs.length; i < len; i++) {
        if (attrs[i][0] === name) {
          return i;
        }
      }
      return -1;
    };
    Token.prototype.attrPush = function attrPush(attrData) {
      if (this.attrs) {
        this.attrs.push(attrData);
      } else {
        this.attrs = [attrData];
      }
    };
    Token.prototype.attrSet = function attrSet(name, value) {
      const idx = this.attrIndex(name);
      const attrData = [name, value];
      if (idx < 0) {
        this.attrPush(attrData);
      } else {
        this.attrs[idx] = attrData;
      }
    };
    Token.prototype.attrGet = function attrGet(name) {
      const idx = this.attrIndex(name);
      let value = null;
      if (idx >= 0) {
        value = this.attrs[idx][1];
      }
      return value;
    };
    Token.prototype.attrJoin = function attrJoin(name, value) {
      const idx = this.attrIndex(name);
      if (idx < 0) {
        this.attrPush([name, value]);
      } else {
        this.attrs[idx][1] = this.attrs[idx][1] + " " + value;
      }
    };
    function StateCore(src, md, env) {
      this.src = src;
      this.env = env;
      this.tokens = [];
      this.inlineMode = false;
      this.md = md;
    }
    StateCore.prototype.Token = Token;
    var NEWLINES_RE = /\r\n?|\n/g;
    var NULL_RE = /\0/g;
    function normalize(state) {
      let str;
      str = state.src.replace(NEWLINES_RE, "\n");
      str = str.replace(NULL_RE, "\uFFFD");
      state.src = str;
    }
    function block(state) {
      let token;
      if (state.inlineMode) {
        token = new state.Token("inline", "", 0);
        token.content = state.src;
        token.map = [0, 1];
        token.children = [];
        state.tokens.push(token);
      } else {
        state.md.block.parse(state.src, state.md, state.env, state.tokens);
      }
    }
    function inline(state) {
      const tokens = state.tokens;
      for (let i = 0, l = tokens.length; i < l; i++) {
        const tok = tokens[i];
        if (tok.type === "inline") {
          state.md.inline.parse(tok.content, state.md, state.env, tok.children);
        }
      }
    }
    function isLinkOpen$1(str) {
      return /^<a[>\s]/i.test(str);
    }
    function isLinkClose$1(str) {
      return /^<\/a\s*>/i.test(str);
    }
    function linkify$1(state) {
      const blockTokens = state.tokens;
      if (!state.md.options.linkify) {
        return;
      }
      for (let j = 0, l = blockTokens.length; j < l; j++) {
        if (blockTokens[j].type !== "inline" || !state.md.linkify.pretest(blockTokens[j].content)) {
          continue;
        }
        let tokens = blockTokens[j].children;
        let htmlLinkLevel = 0;
        for (let i = tokens.length - 1; i >= 0; i--) {
          const currentToken = tokens[i];
          if (currentToken.type === "link_close") {
            i--;
            while (tokens[i].level !== currentToken.level && tokens[i].type !== "link_open") {
              i--;
            }
            continue;
          }
          if (currentToken.type === "html_inline") {
            if (isLinkOpen$1(currentToken.content) && htmlLinkLevel > 0) {
              htmlLinkLevel--;
            }
            if (isLinkClose$1(currentToken.content)) {
              htmlLinkLevel++;
            }
          }
          if (htmlLinkLevel > 0) {
            continue;
          }
          if (currentToken.type === "text" && state.md.linkify.test(currentToken.content)) {
            const text2 = currentToken.content;
            let links = state.md.linkify.match(text2);
            const nodes = [];
            let level = currentToken.level;
            let lastPos = 0;
            if (links.length > 0 && links[0].index === 0 && i > 0 && tokens[i - 1].type === "text_special") {
              links = links.slice(1);
            }
            for (let ln = 0; ln < links.length; ln++) {
              const url = links[ln].url;
              const fullUrl = state.md.normalizeLink(url);
              if (!state.md.validateLink(fullUrl)) {
                continue;
              }
              let urlText = links[ln].text;
              if (!links[ln].schema) {
                urlText = state.md.normalizeLinkText("http://" + urlText).replace(/^http:\/\//, "");
              } else if (links[ln].schema === "mailto:" && !/^mailto:/i.test(urlText)) {
                urlText = state.md.normalizeLinkText("mailto:" + urlText).replace(/^mailto:/, "");
              } else {
                urlText = state.md.normalizeLinkText(urlText);
              }
              const pos = links[ln].index;
              if (pos > lastPos) {
                const token = new state.Token("text", "", 0);
                token.content = text2.slice(lastPos, pos);
                token.level = level;
                nodes.push(token);
              }
              const token_o = new state.Token("link_open", "a", 1);
              token_o.attrs = [["href", fullUrl]];
              token_o.level = level++;
              token_o.markup = "linkify";
              token_o.info = "auto";
              nodes.push(token_o);
              const token_t = new state.Token("text", "", 0);
              token_t.content = urlText;
              token_t.level = level;
              nodes.push(token_t);
              const token_c = new state.Token("link_close", "a", -1);
              token_c.level = --level;
              token_c.markup = "linkify";
              token_c.info = "auto";
              nodes.push(token_c);
              lastPos = links[ln].lastIndex;
            }
            if (lastPos < text2.length) {
              const token = new state.Token("text", "", 0);
              token.content = text2.slice(lastPos);
              token.level = level;
              nodes.push(token);
            }
            blockTokens[j].children = tokens = arrayReplaceAt(tokens, i, nodes);
          }
        }
      }
    }
    var RARE_RE = /\+-|\.\.|\?\?\?\?|!!!!|,,|--/;
    var SCOPED_ABBR_TEST_RE = /\((c|tm|r)\)/i;
    var SCOPED_ABBR_RE = /\((c|tm|r)\)/ig;
    var SCOPED_ABBR = {
      c: "\xA9",
      r: "\xAE",
      tm: "\u2122"
    };
    function replaceFn(match, name) {
      return SCOPED_ABBR[name.toLowerCase()];
    }
    function replace_scoped(inlineTokens) {
      let inside_autolink = 0;
      for (let i = inlineTokens.length - 1; i >= 0; i--) {
        const token = inlineTokens[i];
        if (token.type === "text" && !inside_autolink) {
          token.content = token.content.replace(SCOPED_ABBR_RE, replaceFn);
        }
        if (token.type === "link_open" && token.info === "auto") {
          inside_autolink--;
        }
        if (token.type === "link_close" && token.info === "auto") {
          inside_autolink++;
        }
      }
    }
    function replace_rare(inlineTokens) {
      let inside_autolink = 0;
      for (let i = inlineTokens.length - 1; i >= 0; i--) {
        const token = inlineTokens[i];
        if (token.type === "text" && !inside_autolink) {
          if (RARE_RE.test(token.content)) {
            token.content = token.content.replace(/\+-/g, "\xB1").replace(/\.{2,}/g, "\u2026").replace(/([?!])…/g, "$1..").replace(/([?!]){4,}/g, "$1$1$1").replace(/,{2,}/g, ",").replace(/(^|[^-])---(?=[^-]|$)/mg, "$1\u2014").replace(/(^|\s)--(?=\s|$)/mg, "$1\u2013").replace(/(^|[^-\s])--(?=[^-\s]|$)/mg, "$1\u2013");
          }
        }
        if (token.type === "link_open" && token.info === "auto") {
          inside_autolink--;
        }
        if (token.type === "link_close" && token.info === "auto") {
          inside_autolink++;
        }
      }
    }
    function replace(state) {
      let blkIdx;
      if (!state.md.options.typographer) {
        return;
      }
      for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
        if (state.tokens[blkIdx].type !== "inline") {
          continue;
        }
        if (SCOPED_ABBR_TEST_RE.test(state.tokens[blkIdx].content)) {
          replace_scoped(state.tokens[blkIdx].children);
        }
        if (RARE_RE.test(state.tokens[blkIdx].content)) {
          replace_rare(state.tokens[blkIdx].children);
        }
      }
    }
    var QUOTE_TEST_RE = /['"]/;
    var QUOTE_RE = /['"]/g;
    var APOSTROPHE = "\u2019";
    function replaceAt(str, index, ch) {
      return str.slice(0, index) + ch + str.slice(index + 1);
    }
    function process_inlines(tokens, state) {
      let j;
      const stack = [];
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const thisLevel = tokens[i].level;
        for (j = stack.length - 1; j >= 0; j--) {
          if (stack[j].level <= thisLevel) {
            break;
          }
        }
        stack.length = j + 1;
        if (token.type !== "text") {
          continue;
        }
        let text2 = token.content;
        let pos = 0;
        let max = text2.length;
        OUTER: while (pos < max) {
          QUOTE_RE.lastIndex = pos;
          const t = QUOTE_RE.exec(text2);
          if (!t) {
            break;
          }
          let canOpen = true;
          let canClose = true;
          pos = t.index + 1;
          const isSingle = t[0] === "'";
          let lastChar = 32;
          if (t.index - 1 >= 0) {
            lastChar = text2.charCodeAt(t.index - 1);
          } else {
            for (j = i - 1; j >= 0; j--) {
              if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break;
              if (!tokens[j].content) continue;
              lastChar = tokens[j].content.charCodeAt(tokens[j].content.length - 1);
              break;
            }
          }
          let nextChar = 32;
          if (pos < max) {
            nextChar = text2.charCodeAt(pos);
          } else {
            for (j = i + 1; j < tokens.length; j++) {
              if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break;
              if (!tokens[j].content) continue;
              nextChar = tokens[j].content.charCodeAt(0);
              break;
            }
          }
          const isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctChar(String.fromCharCode(lastChar));
          const isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctChar(String.fromCharCode(nextChar));
          const isLastWhiteSpace = isWhiteSpace(lastChar);
          const isNextWhiteSpace = isWhiteSpace(nextChar);
          if (isNextWhiteSpace) {
            canOpen = false;
          } else if (isNextPunctChar) {
            if (!(isLastWhiteSpace || isLastPunctChar)) {
              canOpen = false;
            }
          }
          if (isLastWhiteSpace) {
            canClose = false;
          } else if (isLastPunctChar) {
            if (!(isNextWhiteSpace || isNextPunctChar)) {
              canClose = false;
            }
          }
          if (nextChar === 34 && t[0] === '"') {
            if (lastChar >= 48 && lastChar <= 57) {
              canClose = canOpen = false;
            }
          }
          if (canOpen && canClose) {
            canOpen = isLastPunctChar;
            canClose = isNextPunctChar;
          }
          if (!canOpen && !canClose) {
            if (isSingle) {
              token.content = replaceAt(token.content, t.index, APOSTROPHE);
            }
            continue;
          }
          if (canClose) {
            for (j = stack.length - 1; j >= 0; j--) {
              let item = stack[j];
              if (stack[j].level < thisLevel) {
                break;
              }
              if (item.single === isSingle && stack[j].level === thisLevel) {
                item = stack[j];
                let openQuote;
                let closeQuote;
                if (isSingle) {
                  openQuote = state.md.options.quotes[2];
                  closeQuote = state.md.options.quotes[3];
                } else {
                  openQuote = state.md.options.quotes[0];
                  closeQuote = state.md.options.quotes[1];
                }
                token.content = replaceAt(token.content, t.index, closeQuote);
                tokens[item.token].content = replaceAt(tokens[item.token].content, item.pos, openQuote);
                pos += closeQuote.length - 1;
                if (item.token === i) {
                  pos += openQuote.length - 1;
                }
                text2 = token.content;
                max = text2.length;
                stack.length = j;
                continue OUTER;
              }
            }
          }
          if (canOpen) {
            stack.push({
              token: i,
              pos: t.index,
              single: isSingle,
              level: thisLevel
            });
          } else if (canClose && isSingle) {
            token.content = replaceAt(token.content, t.index, APOSTROPHE);
          }
        }
      }
    }
    function smartquotes(state) {
      if (!state.md.options.typographer) {
        return;
      }
      for (let blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
        if (state.tokens[blkIdx].type !== "inline" || !QUOTE_TEST_RE.test(state.tokens[blkIdx].content)) {
          continue;
        }
        process_inlines(state.tokens[blkIdx].children, state);
      }
    }
    function text_join(state) {
      let curr, last;
      const blockTokens = state.tokens;
      const l = blockTokens.length;
      for (let j = 0; j < l; j++) {
        if (blockTokens[j].type !== "inline") continue;
        const tokens = blockTokens[j].children;
        const max = tokens.length;
        for (curr = 0; curr < max; curr++) {
          if (tokens[curr].type === "text_special") {
            tokens[curr].type = "text";
          }
        }
        for (curr = last = 0; curr < max; curr++) {
          if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") {
            tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
          } else {
            if (curr !== last) {
              tokens[last] = tokens[curr];
            }
            last++;
          }
        }
        if (curr !== last) {
          tokens.length = last;
        }
      }
    }
    var _rules$2 = [
      ["normalize", normalize],
      ["block", block],
      ["inline", inline],
      ["linkify", linkify$1],
      ["replacements", replace],
      ["smartquotes", smartquotes],
      // `text_join` finds `text_special` tokens (for escape sequences)
      // and joins them with the rest of the text
      ["text_join", text_join]
    ];
    function Core() {
      this.ruler = new Ruler();
      for (let i = 0; i < _rules$2.length; i++) {
        this.ruler.push(_rules$2[i][0], _rules$2[i][1]);
      }
    }
    Core.prototype.process = function(state) {
      const rules = this.ruler.getRules("");
      for (let i = 0, l = rules.length; i < l; i++) {
        rules[i](state);
      }
    };
    Core.prototype.State = StateCore;
    function StateBlock(src, md, env, tokens) {
      this.src = src;
      this.md = md;
      this.env = env;
      this.tokens = tokens;
      this.bMarks = [];
      this.eMarks = [];
      this.tShift = [];
      this.sCount = [];
      this.bsCount = [];
      this.blkIndent = 0;
      this.line = 0;
      this.lineMax = 0;
      this.tight = false;
      this.ddIndent = -1;
      this.listIndent = -1;
      this.parentType = "root";
      this.level = 0;
      const s = this.src;
      for (let start = 0, pos = 0, indent = 0, offset = 0, len = s.length, indent_found = false; pos < len; pos++) {
        const ch = s.charCodeAt(pos);
        if (!indent_found) {
          if (isSpace(ch)) {
            indent++;
            if (ch === 9) {
              offset += 4 - offset % 4;
            } else {
              offset++;
            }
            continue;
          } else {
            indent_found = true;
          }
        }
        if (ch === 10 || pos === len - 1) {
          if (ch !== 10) {
            pos++;
          }
          this.bMarks.push(start);
          this.eMarks.push(pos);
          this.tShift.push(indent);
          this.sCount.push(offset);
          this.bsCount.push(0);
          indent_found = false;
          indent = 0;
          offset = 0;
          start = pos + 1;
        }
      }
      this.bMarks.push(s.length);
      this.eMarks.push(s.length);
      this.tShift.push(0);
      this.sCount.push(0);
      this.bsCount.push(0);
      this.lineMax = this.bMarks.length - 1;
    }
    StateBlock.prototype.push = function(type, tag, nesting) {
      const token = new Token(type, tag, nesting);
      token.block = true;
      if (nesting < 0) this.level--;
      token.level = this.level;
      if (nesting > 0) this.level++;
      this.tokens.push(token);
      return token;
    };
    StateBlock.prototype.isEmpty = function isEmpty(line) {
      return this.bMarks[line] + this.tShift[line] >= this.eMarks[line];
    };
    StateBlock.prototype.skipEmptyLines = function skipEmptyLines(from) {
      for (let max = this.lineMax; from < max; from++) {
        if (this.bMarks[from] + this.tShift[from] < this.eMarks[from]) {
          break;
        }
      }
      return from;
    };
    StateBlock.prototype.skipSpaces = function skipSpaces(pos) {
      for (let max = this.src.length; pos < max; pos++) {
        const ch = this.src.charCodeAt(pos);
        if (!isSpace(ch)) {
          break;
        }
      }
      return pos;
    };
    StateBlock.prototype.skipSpacesBack = function skipSpacesBack(pos, min) {
      if (pos <= min) {
        return pos;
      }
      while (pos > min) {
        if (!isSpace(this.src.charCodeAt(--pos))) {
          return pos + 1;
        }
      }
      return pos;
    };
    StateBlock.prototype.skipChars = function skipChars(pos, code2) {
      for (let max = this.src.length; pos < max; pos++) {
        if (this.src.charCodeAt(pos) !== code2) {
          break;
        }
      }
      return pos;
    };
    StateBlock.prototype.skipCharsBack = function skipCharsBack(pos, code2, min) {
      if (pos <= min) {
        return pos;
      }
      while (pos > min) {
        if (code2 !== this.src.charCodeAt(--pos)) {
          return pos + 1;
        }
      }
      return pos;
    };
    StateBlock.prototype.getLines = function getLines(begin, end, indent, keepLastLF) {
      if (begin >= end) {
        return "";
      }
      const queue = new Array(end - begin);
      for (let i = 0, line = begin; line < end; line++, i++) {
        let lineIndent = 0;
        const lineStart = this.bMarks[line];
        let first = lineStart;
        let last;
        if (line + 1 < end || keepLastLF) {
          last = this.eMarks[line] + 1;
        } else {
          last = this.eMarks[line];
        }
        while (first < last && lineIndent < indent) {
          const ch = this.src.charCodeAt(first);
          if (isSpace(ch)) {
            if (ch === 9) {
              lineIndent += 4 - (lineIndent + this.bsCount[line]) % 4;
            } else {
              lineIndent++;
            }
          } else if (first - lineStart < this.tShift[line]) {
            lineIndent++;
          } else {
            break;
          }
          first++;
        }
        if (lineIndent > indent) {
          queue[i] = new Array(lineIndent - indent + 1).join(" ") + this.src.slice(first, last);
        } else {
          queue[i] = this.src.slice(first, last);
        }
      }
      return queue.join("");
    };
    StateBlock.prototype.Token = Token;
    var MAX_AUTOCOMPLETED_CELLS = 65536;
    function getLine(state, line) {
      const pos = state.bMarks[line] + state.tShift[line];
      const max = state.eMarks[line];
      return state.src.slice(pos, max);
    }
    function escapedSplit(str) {
      const result = [];
      const max = str.length;
      let pos = 0;
      let ch = str.charCodeAt(pos);
      let isEscaped = false;
      let lastPos = 0;
      let current = "";
      while (pos < max) {
        if (ch === 124) {
          if (!isEscaped) {
            result.push(current + str.substring(lastPos, pos));
            current = "";
            lastPos = pos + 1;
          } else {
            current += str.substring(lastPos, pos - 1);
            lastPos = pos;
          }
        }
        isEscaped = ch === 92;
        pos++;
        ch = str.charCodeAt(pos);
      }
      result.push(current + str.substring(lastPos));
      return result;
    }
    function table(state, startLine, endLine, silent) {
      if (startLine + 2 > endLine) {
        return false;
      }
      let nextLine = startLine + 1;
      if (state.sCount[nextLine] < state.blkIndent) {
        return false;
      }
      if (state.sCount[nextLine] - state.blkIndent >= 4) {
        return false;
      }
      let pos = state.bMarks[nextLine] + state.tShift[nextLine];
      if (pos >= state.eMarks[nextLine]) {
        return false;
      }
      const firstCh = state.src.charCodeAt(pos++);
      if (firstCh !== 124 && firstCh !== 45 && firstCh !== 58) {
        return false;
      }
      if (pos >= state.eMarks[nextLine]) {
        return false;
      }
      const secondCh = state.src.charCodeAt(pos++);
      if (secondCh !== 124 && secondCh !== 45 && secondCh !== 58 && !isSpace(secondCh)) {
        return false;
      }
      if (firstCh === 45 && isSpace(secondCh)) {
        return false;
      }
      while (pos < state.eMarks[nextLine]) {
        const ch = state.src.charCodeAt(pos);
        if (ch !== 124 && ch !== 45 && ch !== 58 && !isSpace(ch)) {
          return false;
        }
        pos++;
      }
      let lineText = getLine(state, startLine + 1);
      let columns = lineText.split("|");
      const aligns = [];
      for (let i = 0; i < columns.length; i++) {
        const t = columns[i].trim();
        if (!t) {
          if (i === 0 || i === columns.length - 1) {
            continue;
          } else {
            return false;
          }
        }
        if (!/^:?-+:?$/.test(t)) {
          return false;
        }
        if (t.charCodeAt(t.length - 1) === 58) {
          aligns.push(t.charCodeAt(0) === 58 ? "center" : "right");
        } else if (t.charCodeAt(0) === 58) {
          aligns.push("left");
        } else {
          aligns.push("");
        }
      }
      lineText = getLine(state, startLine).trim();
      if (lineText.indexOf("|") === -1) {
        return false;
      }
      if (state.sCount[startLine] - state.blkIndent >= 4) {
        return false;
      }
      columns = escapedSplit(lineText);
      if (columns.length && columns[0] === "") columns.shift();
      if (columns.length && columns[columns.length - 1] === "") columns.pop();
      const columnCount = columns.length;
      if (columnCount === 0 || columnCount !== aligns.length) {
        return false;
      }
      if (silent) {
        return true;
      }
      const oldParentType = state.parentType;
      state.parentType = "table";
      const terminatorRules = state.md.block.ruler.getRules("blockquote");
      const token_to = state.push("table_open", "table", 1);
      const tableLines = [startLine, 0];
      token_to.map = tableLines;
      const token_tho = state.push("thead_open", "thead", 1);
      token_tho.map = [startLine, startLine + 1];
      const token_htro = state.push("tr_open", "tr", 1);
      token_htro.map = [startLine, startLine + 1];
      for (let i = 0; i < columns.length; i++) {
        const token_ho = state.push("th_open", "th", 1);
        if (aligns[i]) {
          token_ho.attrs = [["style", "text-align:" + aligns[i]]];
        }
        const token_il = state.push("inline", "", 0);
        token_il.content = columns[i].trim();
        token_il.children = [];
        state.push("th_close", "th", -1);
      }
      state.push("tr_close", "tr", -1);
      state.push("thead_close", "thead", -1);
      let tbodyLines;
      let autocompletedCells = 0;
      for (nextLine = startLine + 2; nextLine < endLine; nextLine++) {
        if (state.sCount[nextLine] < state.blkIndent) {
          break;
        }
        let terminate = false;
        for (let i = 0, l = terminatorRules.length; i < l; i++) {
          if (terminatorRules[i](state, nextLine, endLine, true)) {
            terminate = true;
            break;
          }
        }
        if (terminate) {
          break;
        }
        lineText = getLine(state, nextLine).trim();
        if (!lineText) {
          break;
        }
        if (state.sCount[nextLine] - state.blkIndent >= 4) {
          break;
        }
        columns = escapedSplit(lineText);
        if (columns.length && columns[0] === "") columns.shift();
        if (columns.length && columns[columns.length - 1] === "") columns.pop();
        autocompletedCells += columnCount - columns.length;
        if (autocompletedCells > MAX_AUTOCOMPLETED_CELLS) {
          break;
        }
        if (nextLine === startLine + 2) {
          const token_tbo = state.push("tbody_open", "tbody", 1);
          token_tbo.map = tbodyLines = [startLine + 2, 0];
        }
        const token_tro = state.push("tr_open", "tr", 1);
        token_tro.map = [nextLine, nextLine + 1];
        for (let i = 0; i < columnCount; i++) {
          const token_tdo = state.push("td_open", "td", 1);
          if (aligns[i]) {
            token_tdo.attrs = [["style", "text-align:" + aligns[i]]];
          }
          const token_il = state.push("inline", "", 0);
          token_il.content = columns[i] ? columns[i].trim() : "";
          token_il.children = [];
          state.push("td_close", "td", -1);
        }
        state.push("tr_close", "tr", -1);
      }
      if (tbodyLines) {
        state.push("tbody_close", "tbody", -1);
        tbodyLines[1] = nextLine;
      }
      state.push("table_close", "table", -1);
      tableLines[1] = nextLine;
      state.parentType = oldParentType;
      state.line = nextLine;
      return true;
    }
    function code(state, startLine, endLine) {
      if (state.sCount[startLine] - state.blkIndent < 4) {
        return false;
      }
      let nextLine = startLine + 1;
      let last = nextLine;
      while (nextLine < endLine) {
        if (state.isEmpty(nextLine)) {
          nextLine++;
          continue;
        }
        if (state.sCount[nextLine] - state.blkIndent >= 4) {
          nextLine++;
          last = nextLine;
          continue;
        }
        break;
      }
      state.line = last;
      const token = state.push("code_block", "code", 0);
      token.content = state.getLines(startLine, last, 4 + state.blkIndent, false) + "\n";
      token.map = [startLine, state.line];
      return true;
    }
    function fence(state, startLine, endLine, silent) {
      let pos = state.bMarks[startLine] + state.tShift[startLine];
      let max = state.eMarks[startLine];
      if (state.sCount[startLine] - state.blkIndent >= 4) {
        return false;
      }
      if (pos + 3 > max) {
        return false;
      }
      const marker = state.src.charCodeAt(pos);
      if (marker !== 126 && marker !== 96) {
        return false;
      }
      let mem = pos;
      pos = state.skipChars(pos, marker);
      let len = pos - mem;
      if (len < 3) {
        return false;
      }
      const markup = state.src.slice(mem, pos);
      const params = state.src.slice(pos, max);
      if (marker === 96) {
        if (params.indexOf(String.fromCharCode(marker)) >= 0) {
          return false;
        }
      }
      if (silent) {
        return true;
      }
      let nextLine = startLine;
      let haveEndMarker = false;
      for (; ; ) {
        nextLine++;
        if (nextLine >= endLine) {
          break;
        }
        pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
        max = state.eMarks[nextLine];
        if (pos < max && state.sCount[nextLine] < state.blkIndent) {
          break;
        }
        if (state.src.charCodeAt(pos) !== marker) {
          continue;
        }
        if (state.sCount[nextLine] - state.blkIndent >= 4) {
          continue;
        }
        pos = state.skipChars(pos, marker);
        if (pos - mem < len) {
          continue;
        }
        pos = state.skipSpaces(pos);
        if (pos < max) {
          continue;
        }
        haveEndMarker = true;
        break;
      }
      len = state.sCount[startLine];
      state.line = nextLine + (haveEndMarker ? 1 : 0);
      const token = state.push("fence", "code", 0);
      token.info = params;
      token.content = state.getLines(startLine + 1, nextLine, len, true);
      token.markup = markup;
      token.map = [startLine, state.line];
      return true;
    }
    function blockquote(state, startLine, endLine, silent) {
      let pos = state.bMarks[startLine] + state.tShift[startLine];
      let max = state.eMarks[startLine];
      const oldLineMax = state.lineMax;
      if (state.sCount[startLine] - state.blkIndent >= 4) {
        return false;
      }
      if (state.src.charCodeAt(pos) !== 62) {
        return false;
      }
      if (silent) {
        return true;
      }
      const oldBMarks = [];
      const oldBSCount = [];
      const oldSCount = [];
      const oldTShift = [];
      const terminatorRules = state.md.block.ruler.getRules("blockquote");
      const oldParentType = state.parentType;
      state.parentType = "blockquote";
      let lastLineEmpty = false;
      let nextLine;
      for (nextLine = startLine; nextLine < endLine; nextLine++) {
        const isOutdented = state.sCount[nextLine] < state.blkIndent;
        pos = state.bMarks[nextLine] + state.tShift[nextLine];
        max = state.eMarks[nextLine];
        if (pos >= max) {
          break;
        }
        if (state.src.charCodeAt(pos++) === 62 && !isOutdented) {
          let initial = state.sCount[nextLine] + 1;
          let spaceAfterMarker;
          let adjustTab;
          if (state.src.charCodeAt(pos) === 32) {
            pos++;
            initial++;
            adjustTab = false;
            spaceAfterMarker = true;
          } else if (state.src.charCodeAt(pos) === 9) {
            spaceAfterMarker = true;
            if ((state.bsCount[nextLine] + initial) % 4 === 3) {
              pos++;
              initial++;
              adjustTab = false;
            } else {
              adjustTab = true;
            }
          } else {
            spaceAfterMarker = false;
          }
          let offset = initial;
          oldBMarks.push(state.bMarks[nextLine]);
          state.bMarks[nextLine] = pos;
          while (pos < max) {
            const ch = state.src.charCodeAt(pos);
            if (isSpace(ch)) {
              if (ch === 9) {
                offset += 4 - (offset + state.bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4;
              } else {
                offset++;
              }
            } else {
              break;
            }
            pos++;
          }
          lastLineEmpty = pos >= max;
          oldBSCount.push(state.bsCount[nextLine]);
          state.bsCount[nextLine] = state.sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0);
          oldSCount.push(state.sCount[nextLine]);
          state.sCount[nextLine] = offset - initial;
          oldTShift.push(state.tShift[nextLine]);
          state.tShift[nextLine] = pos - state.bMarks[nextLine];
          continue;
        }
        if (lastLineEmpty) {
          break;
        }
        let terminate = false;
        for (let i = 0, l = terminatorRules.length; i < l; i++) {
          if (terminatorRules[i](state, nextLine, endLine, true)) {
            terminate = true;
            break;
          }
        }
        if (terminate) {
          state.lineMax = nextLine;
          if (state.blkIndent !== 0) {
            oldBMarks.push(state.bMarks[nextLine]);
            oldBSCount.push(state.bsCount[nextLine]);
            oldTShift.push(state.tShift[nextLine]);
            oldSCount.push(state.sCount[nextLine]);
            state.sCount[nextLine] -= state.blkIndent;
          }
          break;
        }
        oldBMarks.push(state.bMarks[nextLine]);
        oldBSCount.push(state.bsCount[nextLine]);
        oldTShift.push(state.tShift[nextLine]);
        oldSCount.push(state.sCount[nextLine]);
        state.sCount[nextLine] = -1;
      }
      const oldIndent = state.blkIndent;
      state.blkIndent = 0;
      const token_o = state.push("blockquote_open", "blockquote", 1);
      token_o.markup = ">";
      const lines = [startLine, 0];
      token_o.map = lines;
      state.md.block.tokenize(state, startLine, nextLine);
      const token_c = state.push("blockquote_close", "blockquote", -1);
      token_c.markup = ">";
      state.lineMax = oldLineMax;
      state.parentType = oldParentType;
      lines[1] = state.line;
      for (let i = 0; i < oldTShift.length; i++) {
        state.bMarks[i + startLine] = oldBMarks[i];
        state.tShift[i + startLine] = oldTShift[i];
        state.sCount[i + startLine] = oldSCount[i];
        state.bsCount[i + startLine] = oldBSCount[i];
      }
      state.blkIndent = oldIndent;
      return true;
    }
    function hr(state, startLine, endLine, silent) {
      const max = state.eMarks[startLine];
      if (state.sCount[startLine] - state.blkIndent >= 4) {
        return false;
      }
      let pos = state.bMarks[startLine] + state.tShift[startLine];
      const marker = state.src.charCodeAt(pos++);
      if (marker !== 42 && marker !== 45 && marker !== 95) {
        return false;
      }
      let cnt = 1;
      while (pos < max) {
        const ch = state.src.charCodeAt(pos++);
        if (ch !== marker && !isSpace(ch)) {
          return false;
        }
        if (ch === marker) {
          cnt++;
        }
      }
      if (cnt < 3) {
        return false;
      }
      if (silent) {
        return true;
      }
      state.line = startLine + 1;
      const token = state.push("hr", "hr", 0);
      token.map = [startLine, state.line];
      token.markup = Array(cnt + 1).join(String.fromCharCode(marker));
      return true;
    }
    function skipBulletListMarker(state, startLine) {
      const max = state.eMarks[startLine];
      let pos = state.bMarks[startLine] + state.tShift[startLine];
      const marker = state.src.charCodeAt(pos++);
      if (marker !== 42 && marker !== 45 && marker !== 43) {
        return -1;
      }
      if (pos < max) {
        const ch = state.src.charCodeAt(pos);
        if (!isSpace(ch)) {
          return -1;
        }
      }
      return pos;
    }
    function skipOrderedListMarker(state, startLine) {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      let pos = start;
      if (pos + 1 >= max) {
        return -1;
      }
      let ch = state.src.charCodeAt(pos++);
      if (ch < 48 || ch > 57) {
        return -1;
      }
      for (; ; ) {
        if (pos >= max) {
          return -1;
        }
        ch = state.src.charCodeAt(pos++);
        if (ch >= 48 && ch <= 57) {
          if (pos - start >= 10) {
            return -1;
          }
          continue;
        }
        if (ch === 41 || ch === 46) {
          break;
        }
        return -1;
      }
      if (pos < max) {
        ch = state.src.charCodeAt(pos);
        if (!isSpace(ch)) {
          return -1;
        }
      }
      return pos;
    }
    function markTightParagraphs(state, idx) {
      const level = state.level + 2;
      for (let i = idx + 2, l = state.tokens.length - 2; i < l; i++) {
        if (state.tokens[i].level === level && state.tokens[i].type === "paragraph_open") {
          state.tokens[i + 2].hidden = true;
          state.tokens[i].hidden = true;
          i += 2;
        }
      }
    }
    function list(state, startLine, endLine, silent) {
      let max, pos, start, token;
      let nextLine = startLine;
      let tight = true;
      if (state.sCount[nextLine] - state.blkIndent >= 4) {
        return false;
      }
      if (state.listIndent >= 0 && state.sCount[nextLine] - state.listIndent >= 4 && state.sCount[nextLine] < state.blkIndent) {
        return false;
      }
      let isTerminatingParagraph = false;
      if (silent && state.parentType === "paragraph") {
        if (state.sCount[nextLine] >= state.blkIndent) {
          isTerminatingParagraph = true;
        }
      }
      let isOrdered;
      let markerValue;
      let posAfterMarker;
      if ((posAfterMarker = skipOrderedListMarker(state, nextLine)) >= 0) {
        isOrdered = true;
        start = state.bMarks[nextLine] + state.tShift[nextLine];
        markerValue = Number(state.src.slice(start, posAfterMarker - 1));
        if (isTerminatingParagraph && markerValue !== 1) return false;
      } else if ((posAfterMarker = skipBulletListMarker(state, nextLine)) >= 0) {
        isOrdered = false;
      } else {
        return false;
      }
      if (isTerminatingParagraph) {
        if (state.skipSpaces(posAfterMarker) >= state.eMarks[nextLine]) return false;
      }
      if (silent) {
        return true;
      }
      const markerCharCode = state.src.charCodeAt(posAfterMarker - 1);
      const listTokIdx = state.tokens.length;
      if (isOrdered) {
        token = state.push("ordered_list_open", "ol", 1);
        if (markerValue !== 1) {
          token.attrs = [["start", markerValue]];
        }
      } else {
        token = state.push("bullet_list_open", "ul", 1);
      }
      const listLines = [nextLine, 0];
      token.map = listLines;
      token.markup = String.fromCharCode(markerCharCode);
      let prevEmptyEnd = false;
      const terminatorRules = state.md.block.ruler.getRules("list");
      const oldParentType = state.parentType;
      state.parentType = "list";
      while (nextLine < endLine) {
        pos = posAfterMarker;
        max = state.eMarks[nextLine];
        const initial = state.sCount[nextLine] + posAfterMarker - (state.bMarks[nextLine] + state.tShift[nextLine]);
        let offset = initial;
        while (pos < max) {
          const ch = state.src.charCodeAt(pos);
          if (ch === 9) {
            offset += 4 - (offset + state.bsCount[nextLine]) % 4;
          } else if (ch === 32) {
            offset++;
          } else {
            break;
          }
          pos++;
        }
        const contentStart = pos;
        let indentAfterMarker;
        if (contentStart >= max) {
          indentAfterMarker = 1;
        } else {
          indentAfterMarker = offset - initial;
        }
        if (indentAfterMarker > 4) {
          indentAfterMarker = 1;
        }
        const indent = initial + indentAfterMarker;
        token = state.push("list_item_open", "li", 1);
        token.markup = String.fromCharCode(markerCharCode);
        const itemLines = [nextLine, 0];
        token.map = itemLines;
        if (isOrdered) {
          token.info = state.src.slice(start, posAfterMarker - 1);
        }
        const oldTight = state.tight;
        const oldTShift = state.tShift[nextLine];
        const oldSCount = state.sCount[nextLine];
        const oldListIndent = state.listIndent;
        state.listIndent = state.blkIndent;
        state.blkIndent = indent;
        state.tight = true;
        state.tShift[nextLine] = contentStart - state.bMarks[nextLine];
        state.sCount[nextLine] = offset;
        if (contentStart >= max && state.isEmpty(nextLine + 1)) {
          state.line = Math.min(state.line + 2, endLine);
        } else {
          state.md.block.tokenize(state, nextLine, endLine, true);
        }
        if (!state.tight || prevEmptyEnd) {
          tight = false;
        }
        prevEmptyEnd = state.line - nextLine > 1 && state.isEmpty(state.line - 1);
        state.blkIndent = state.listIndent;
        state.listIndent = oldListIndent;
        state.tShift[nextLine] = oldTShift;
        state.sCount[nextLine] = oldSCount;
        state.tight = oldTight;
        token = state.push("list_item_close", "li", -1);
        token.markup = String.fromCharCode(markerCharCode);
        nextLine = state.line;
        itemLines[1] = nextLine;
        if (nextLine >= endLine) {
          break;
        }
        if (state.sCount[nextLine] < state.blkIndent) {
          break;
        }
        if (state.sCount[nextLine] - state.blkIndent >= 4) {
          break;
        }
        let terminate = false;
        for (let i = 0, l = terminatorRules.length; i < l; i++) {
          if (terminatorRules[i](state, nextLine, endLine, true)) {
            terminate = true;
            break;
          }
        }
        if (terminate) {
          break;
        }
        if (isOrdered) {
          posAfterMarker = skipOrderedListMarker(state, nextLine);
          if (posAfterMarker < 0) {
            break;
          }
          start = state.bMarks[nextLine] + state.tShift[nextLine];
        } else {
          posAfterMarker = skipBulletListMarker(state, nextLine);
          if (posAfterMarker < 0) {
            break;
          }
        }
        if (markerCharCode !== state.src.charCodeAt(posAfterMarker - 1)) {
          break;
        }
      }
      if (isOrdered) {
        token = state.push("ordered_list_close", "ol", -1);
      } else {
        token = state.push("bullet_list_close", "ul", -1);
      }
      token.markup = String.fromCharCode(markerCharCode);
      listLines[1] = nextLine;
      state.line = nextLine;
      state.parentType = oldParentType;
      if (tight) {
        markTightParagraphs(state, listTokIdx);
      }
      return true;
    }
    function reference(state, startLine, _endLine, silent) {
      let pos = state.bMarks[startLine] + state.tShift[startLine];
      let max = state.eMarks[startLine];
      let nextLine = startLine + 1;
      if (state.sCount[startLine] - state.blkIndent >= 4) {
        return false;
      }
      if (state.src.charCodeAt(pos) !== 91) {
        return false;
      }
      function getNextLine(nextLine2) {
        const endLine = state.lineMax;
        if (nextLine2 >= endLine || state.isEmpty(nextLine2)) {
          return null;
        }
        let isContinuation = false;
        if (state.sCount[nextLine2] - state.blkIndent > 3) {
          isContinuation = true;
        }
        if (state.sCount[nextLine2] < 0) {
          isContinuation = true;
        }
        if (!isContinuation) {
          const terminatorRules = state.md.block.ruler.getRules("reference");
          const oldParentType = state.parentType;
          state.parentType = "reference";
          let terminate = false;
          for (let i = 0, l = terminatorRules.length; i < l; i++) {
            if (terminatorRules[i](state, nextLine2, endLine, true)) {
              terminate = true;
              break;
            }
          }
          state.parentType = oldParentType;
          if (terminate) {
            return null;
          }
        }
        const pos2 = state.bMarks[nextLine2] + state.tShift[nextLine2];
        const max2 = state.eMarks[nextLine2];
        return state.src.slice(pos2, max2 + 1);
      }
      let str = state.src.slice(pos, max + 1);
      max = str.length;
      let labelEnd = -1;
      for (pos = 1; pos < max; pos++) {
        const ch = str.charCodeAt(pos);
        if (ch === 91) {
          return false;
        } else if (ch === 93) {
          labelEnd = pos;
          break;
        } else if (ch === 10) {
          const lineContent = getNextLine(nextLine);
          if (lineContent !== null) {
            str += lineContent;
            max = str.length;
            nextLine++;
          }
        } else if (ch === 92) {
          pos++;
          if (pos < max && str.charCodeAt(pos) === 10) {
            const lineContent = getNextLine(nextLine);
            if (lineContent !== null) {
              str += lineContent;
              max = str.length;
              nextLine++;
            }
          }
        }
      }
      if (labelEnd < 0 || str.charCodeAt(labelEnd + 1) !== 58) {
        return false;
      }
      for (pos = labelEnd + 2; pos < max; pos++) {
        const ch = str.charCodeAt(pos);
        if (ch === 10) {
          const lineContent = getNextLine(nextLine);
          if (lineContent !== null) {
            str += lineContent;
            max = str.length;
            nextLine++;
          }
        } else if (isSpace(ch)) ;
        else {
          break;
        }
      }
      const destRes = state.md.helpers.parseLinkDestination(str, pos, max);
      if (!destRes.ok) {
        return false;
      }
      const href = state.md.normalizeLink(destRes.str);
      if (!state.md.validateLink(href)) {
        return false;
      }
      pos = destRes.pos;
      const destEndPos = pos;
      const destEndLineNo = nextLine;
      const start = pos;
      for (; pos < max; pos++) {
        const ch = str.charCodeAt(pos);
        if (ch === 10) {
          const lineContent = getNextLine(nextLine);
          if (lineContent !== null) {
            str += lineContent;
            max = str.length;
            nextLine++;
          }
        } else if (isSpace(ch)) ;
        else {
          break;
        }
      }
      let titleRes = state.md.helpers.parseLinkTitle(str, pos, max);
      while (titleRes.can_continue) {
        const lineContent = getNextLine(nextLine);
        if (lineContent === null) break;
        str += lineContent;
        pos = max;
        max = str.length;
        nextLine++;
        titleRes = state.md.helpers.parseLinkTitle(str, pos, max, titleRes);
      }
      let title;
      if (pos < max && start !== pos && titleRes.ok) {
        title = titleRes.str;
        pos = titleRes.pos;
      } else {
        title = "";
        pos = destEndPos;
        nextLine = destEndLineNo;
      }
      while (pos < max) {
        const ch = str.charCodeAt(pos);
        if (!isSpace(ch)) {
          break;
        }
        pos++;
      }
      if (pos < max && str.charCodeAt(pos) !== 10) {
        if (title) {
          title = "";
          pos = destEndPos;
          nextLine = destEndLineNo;
          while (pos < max) {
            const ch = str.charCodeAt(pos);
            if (!isSpace(ch)) {
              break;
            }
            pos++;
          }
        }
      }
      if (pos < max && str.charCodeAt(pos) !== 10) {
        return false;
      }
      const label = normalizeReference(str.slice(1, labelEnd));
      if (!label) {
        return false;
      }
      if (silent) {
        return true;
      }
      if (typeof state.env.references === "undefined") {
        state.env.references = {};
      }
      if (typeof state.env.references[label] === "undefined") {
        state.env.references[label] = {
          title,
          href
        };
      }
      state.line = nextLine;
      return true;
    }
    var block_names = ["address", "article", "aside", "base", "basefont", "blockquote", "body", "caption", "center", "col", "colgroup", "dd", "details", "dialog", "dir", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr", "html", "iframe", "legend", "li", "link", "main", "menu", "menuitem", "nav", "noframes", "ol", "optgroup", "option", "p", "param", "search", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "title", "tr", "track", "ul"];
    var attr_name = "[a-zA-Z_:][a-zA-Z0-9:._-]*";
    var unquoted = "[^\"'=<>`\\x00-\\x20]+";
    var single_quoted = "'[^']*'";
    var double_quoted = '"[^"]*"';
    var attr_value = "(?:" + unquoted + "|" + single_quoted + "|" + double_quoted + ")";
    var attribute = "(?:\\s+" + attr_name + "(?:\\s*=\\s*" + attr_value + ")?)";
    var open_tag = "<[A-Za-z][A-Za-z0-9\\-]*" + attribute + "*\\s*\\/?>";
    var close_tag = "<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>";
    var comment = "<!---?>|<!--(?:[^-]|-[^-]|--[^>])*-->";
    var processing = "<[?][\\s\\S]*?[?]>";
    var declaration = "<![A-Za-z][^>]*>";
    var cdata = "<!\\[CDATA\\[[\\s\\S]*?\\]\\]>";
    var HTML_TAG_RE = new RegExp("^(?:" + open_tag + "|" + close_tag + "|" + comment + "|" + processing + "|" + declaration + "|" + cdata + ")");
    var HTML_OPEN_CLOSE_TAG_RE = new RegExp("^(?:" + open_tag + "|" + close_tag + ")");
    var HTML_SEQUENCES = [[/^<(script|pre|style|textarea)(?=(\s|>|$))/i, /<\/(script|pre|style|textarea)>/i, true], [/^<!--/, /-->/, true], [/^<\?/, /\?>/, true], [/^<![A-Z]/, />/, true], [/^<!\[CDATA\[/, /\]\]>/, true], [new RegExp("^</?(" + block_names.join("|") + ")(?=(\\s|/?>|$))", "i"), /^$/, true], [new RegExp(HTML_OPEN_CLOSE_TAG_RE.source + "\\s*$"), /^$/, false]];
    function html_block(state, startLine, endLine, silent) {
      let pos = state.bMarks[startLine] + state.tShift[startLine];
      let max = state.eMarks[startLine];
      if (state.sCount[startLine] - state.blkIndent >= 4) {
        return false;
      }
      if (!state.md.options.html) {
        return false;
      }
      if (state.src.charCodeAt(pos) !== 60) {
        return false;
      }
      let lineText = state.src.slice(pos, max);
      let i = 0;
      for (; i < HTML_SEQUENCES.length; i++) {
        if (HTML_SEQUENCES[i][0].test(lineText)) {
          break;
        }
      }
      if (i === HTML_SEQUENCES.length) {
        return false;
      }
      if (silent) {
        return HTML_SEQUENCES[i][2];
      }
      let nextLine = startLine + 1;
      if (!HTML_SEQUENCES[i][1].test(lineText)) {
        for (; nextLine < endLine; nextLine++) {
          if (state.sCount[nextLine] < state.blkIndent) {
            break;
          }
          pos = state.bMarks[nextLine] + state.tShift[nextLine];
          max = state.eMarks[nextLine];
          lineText = state.src.slice(pos, max);
          if (HTML_SEQUENCES[i][1].test(lineText)) {
            if (lineText.length !== 0) {
              nextLine++;
            }
            break;
          }
        }
      }
      state.line = nextLine;
      const token = state.push("html_block", "", 0);
      token.map = [startLine, nextLine];
      token.content = state.getLines(startLine, nextLine, state.blkIndent, true);
      return true;
    }
    function heading(state, startLine, endLine, silent) {
      let pos = state.bMarks[startLine] + state.tShift[startLine];
      let max = state.eMarks[startLine];
      if (state.sCount[startLine] - state.blkIndent >= 4) {
        return false;
      }
      let ch = state.src.charCodeAt(pos);
      if (ch !== 35 || pos >= max) {
        return false;
      }
      let level = 1;
      ch = state.src.charCodeAt(++pos);
      while (ch === 35 && pos < max && level <= 6) {
        level++;
        ch = state.src.charCodeAt(++pos);
      }
      if (level > 6 || pos < max && !isSpace(ch)) {
        return false;
      }
      if (silent) {
        return true;
      }
      max = state.skipSpacesBack(max, pos);
      const tmp = state.skipCharsBack(max, 35, pos);
      if (tmp > pos && isSpace(state.src.charCodeAt(tmp - 1))) {
        max = tmp;
      }
      state.line = startLine + 1;
      const token_o = state.push("heading_open", "h" + String(level), 1);
      token_o.markup = "########".slice(0, level);
      token_o.map = [startLine, state.line];
      const token_i = state.push("inline", "", 0);
      token_i.content = state.src.slice(pos, max).trim();
      token_i.map = [startLine, state.line];
      token_i.children = [];
      const token_c = state.push("heading_close", "h" + String(level), -1);
      token_c.markup = "########".slice(0, level);
      return true;
    }
    function lheading(state, startLine, endLine) {
      const terminatorRules = state.md.block.ruler.getRules("paragraph");
      if (state.sCount[startLine] - state.blkIndent >= 4) {
        return false;
      }
      const oldParentType = state.parentType;
      state.parentType = "paragraph";
      let level = 0;
      let marker;
      let nextLine = startLine + 1;
      for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
        if (state.sCount[nextLine] - state.blkIndent > 3) {
          continue;
        }
        if (state.sCount[nextLine] >= state.blkIndent) {
          let pos = state.bMarks[nextLine] + state.tShift[nextLine];
          const max = state.eMarks[nextLine];
          if (pos < max) {
            marker = state.src.charCodeAt(pos);
            if (marker === 45 || marker === 61) {
              pos = state.skipChars(pos, marker);
              pos = state.skipSpaces(pos);
              if (pos >= max) {
                level = marker === 61 ? 1 : 2;
                break;
              }
            }
          }
        }
        if (state.sCount[nextLine] < 0) {
          continue;
        }
        let terminate = false;
        for (let i = 0, l = terminatorRules.length; i < l; i++) {
          if (terminatorRules[i](state, nextLine, endLine, true)) {
            terminate = true;
            break;
          }
        }
        if (terminate) {
          break;
        }
      }
      if (!level) {
        return false;
      }
      const content = state.getLines(startLine, nextLine, state.blkIndent, false).trim();
      state.line = nextLine + 1;
      const token_o = state.push("heading_open", "h" + String(level), 1);
      token_o.markup = String.fromCharCode(marker);
      token_o.map = [startLine, state.line];
      const token_i = state.push("inline", "", 0);
      token_i.content = content;
      token_i.map = [startLine, state.line - 1];
      token_i.children = [];
      const token_c = state.push("heading_close", "h" + String(level), -1);
      token_c.markup = String.fromCharCode(marker);
      state.parentType = oldParentType;
      return true;
    }
    function paragraph(state, startLine, endLine) {
      const terminatorRules = state.md.block.ruler.getRules("paragraph");
      const oldParentType = state.parentType;
      let nextLine = startLine + 1;
      state.parentType = "paragraph";
      for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
        if (state.sCount[nextLine] - state.blkIndent > 3) {
          continue;
        }
        if (state.sCount[nextLine] < 0) {
          continue;
        }
        let terminate = false;
        for (let i = 0, l = terminatorRules.length; i < l; i++) {
          if (terminatorRules[i](state, nextLine, endLine, true)) {
            terminate = true;
            break;
          }
        }
        if (terminate) {
          break;
        }
      }
      const content = state.getLines(startLine, nextLine, state.blkIndent, false).trim();
      state.line = nextLine;
      const token_o = state.push("paragraph_open", "p", 1);
      token_o.map = [startLine, state.line];
      const token_i = state.push("inline", "", 0);
      token_i.content = content;
      token_i.map = [startLine, state.line];
      token_i.children = [];
      state.push("paragraph_close", "p", -1);
      state.parentType = oldParentType;
      return true;
    }
    var _rules$1 = [
      // First 2 params - rule name & source. Secondary array - list of rules,
      // which can be terminated by this one.
      ["table", table, ["paragraph", "reference"]],
      ["code", code],
      ["fence", fence, ["paragraph", "reference", "blockquote", "list"]],
      ["blockquote", blockquote, ["paragraph", "reference", "blockquote", "list"]],
      ["hr", hr, ["paragraph", "reference", "blockquote", "list"]],
      ["list", list, ["paragraph", "reference", "blockquote"]],
      ["reference", reference],
      ["html_block", html_block, ["paragraph", "reference", "blockquote"]],
      ["heading", heading, ["paragraph", "reference", "blockquote"]],
      ["lheading", lheading],
      ["paragraph", paragraph]
    ];
    function ParserBlock() {
      this.ruler = new Ruler();
      for (let i = 0; i < _rules$1.length; i++) {
        this.ruler.push(_rules$1[i][0], _rules$1[i][1], {
          alt: (_rules$1[i][2] || []).slice()
        });
      }
    }
    ParserBlock.prototype.tokenize = function(state, startLine, endLine) {
      const rules = this.ruler.getRules("");
      const len = rules.length;
      const maxNesting = state.md.options.maxNesting;
      let line = startLine;
      let hasEmptyLines = false;
      while (line < endLine) {
        state.line = line = state.skipEmptyLines(line);
        if (line >= endLine) {
          break;
        }
        if (state.sCount[line] < state.blkIndent) {
          break;
        }
        if (state.level >= maxNesting) {
          state.line = endLine;
          break;
        }
        const prevLine = state.line;
        let ok = false;
        for (let i = 0; i < len; i++) {
          ok = rules[i](state, line, endLine, false);
          if (ok) {
            if (prevLine >= state.line) {
              throw new Error("block rule didn't increment state.line");
            }
            break;
          }
        }
        if (!ok) throw new Error("none of the block rules matched");
        state.tight = !hasEmptyLines;
        if (state.isEmpty(state.line - 1)) {
          hasEmptyLines = true;
        }
        line = state.line;
        if (line < endLine && state.isEmpty(line)) {
          hasEmptyLines = true;
          line++;
          state.line = line;
        }
      }
    };
    ParserBlock.prototype.parse = function(src, md, env, outTokens) {
      if (!src) {
        return;
      }
      const state = new this.State(src, md, env, outTokens);
      this.tokenize(state, state.line, state.lineMax);
    };
    ParserBlock.prototype.State = StateBlock;
    function StateInline(src, md, env, outTokens) {
      this.src = src;
      this.env = env;
      this.md = md;
      this.tokens = outTokens;
      this.tokens_meta = Array(outTokens.length);
      this.pos = 0;
      this.posMax = this.src.length;
      this.level = 0;
      this.pending = "";
      this.pendingLevel = 0;
      this.cache = {};
      this.delimiters = [];
      this._prev_delimiters = [];
      this.backticks = {};
      this.backticksScanned = false;
      this.linkLevel = 0;
    }
    StateInline.prototype.pushPending = function() {
      const token = new Token("text", "", 0);
      token.content = this.pending;
      token.level = this.pendingLevel;
      this.tokens.push(token);
      this.pending = "";
      return token;
    };
    StateInline.prototype.push = function(type, tag, nesting) {
      if (this.pending) {
        this.pushPending();
      }
      const token = new Token(type, tag, nesting);
      let token_meta = null;
      if (nesting < 0) {
        this.level--;
        this.delimiters = this._prev_delimiters.pop();
      }
      token.level = this.level;
      if (nesting > 0) {
        this.level++;
        this._prev_delimiters.push(this.delimiters);
        this.delimiters = [];
        token_meta = {
          delimiters: this.delimiters
        };
      }
      this.pendingLevel = this.level;
      this.tokens.push(token);
      this.tokens_meta.push(token_meta);
      return token;
    };
    StateInline.prototype.scanDelims = function(start, canSplitWord) {
      const max = this.posMax;
      const marker = this.src.charCodeAt(start);
      const lastChar = start > 0 ? this.src.charCodeAt(start - 1) : 32;
      let pos = start;
      while (pos < max && this.src.charCodeAt(pos) === marker) {
        pos++;
      }
      const count = pos - start;
      const nextChar = pos < max ? this.src.charCodeAt(pos) : 32;
      const isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctChar(String.fromCharCode(lastChar));
      const isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctChar(String.fromCharCode(nextChar));
      const isLastWhiteSpace = isWhiteSpace(lastChar);
      const isNextWhiteSpace = isWhiteSpace(nextChar);
      const left_flanking = !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar);
      const right_flanking = !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar);
      const can_open = left_flanking && (canSplitWord || !right_flanking || isLastPunctChar);
      const can_close = right_flanking && (canSplitWord || !left_flanking || isNextPunctChar);
      return {
        can_open,
        can_close,
        length: count
      };
    };
    StateInline.prototype.Token = Token;
    function isTerminatorChar(ch) {
      switch (ch) {
        case 10:
        case 33:
        case 35:
        case 36:
        case 37:
        case 38:
        case 42:
        case 43:
        case 45:
        case 58:
        case 60:
        case 61:
        case 62:
        case 64:
        case 91:
        case 92:
        case 93:
        case 94:
        case 95:
        case 96:
        case 123:
        case 125:
        case 126:
          return true;
        default:
          return false;
      }
    }
    function text(state, silent) {
      let pos = state.pos;
      while (pos < state.posMax && !isTerminatorChar(state.src.charCodeAt(pos))) {
        pos++;
      }
      if (pos === state.pos) {
        return false;
      }
      if (!silent) {
        state.pending += state.src.slice(state.pos, pos);
      }
      state.pos = pos;
      return true;
    }
    var SCHEME_RE = /(?:^|[^a-z0-9.+-])([a-z][a-z0-9.+-]*)$/i;
    function linkify(state, silent) {
      if (!state.md.options.linkify) return false;
      if (state.linkLevel > 0) return false;
      const pos = state.pos;
      const max = state.posMax;
      if (pos + 3 > max) return false;
      if (state.src.charCodeAt(pos) !== 58) return false;
      if (state.src.charCodeAt(pos + 1) !== 47) return false;
      if (state.src.charCodeAt(pos + 2) !== 47) return false;
      const match = state.pending.match(SCHEME_RE);
      if (!match) return false;
      const proto = match[1];
      const link2 = state.md.linkify.matchAtStart(state.src.slice(pos - proto.length));
      if (!link2) return false;
      let url = link2.url;
      if (url.length <= proto.length) return false;
      let urlEnd = url.length;
      while (urlEnd > 0 && url.charCodeAt(urlEnd - 1) === 42) {
        urlEnd--;
      }
      if (urlEnd !== url.length) {
        url = url.slice(0, urlEnd);
      }
      const fullUrl = state.md.normalizeLink(url);
      if (!state.md.validateLink(fullUrl)) return false;
      if (!silent) {
        state.pending = state.pending.slice(0, -proto.length);
        const token_o = state.push("link_open", "a", 1);
        token_o.attrs = [["href", fullUrl]];
        token_o.markup = "linkify";
        token_o.info = "auto";
        const token_t = state.push("text", "", 0);
        token_t.content = state.md.normalizeLinkText(url);
        const token_c = state.push("link_close", "a", -1);
        token_c.markup = "linkify";
        token_c.info = "auto";
      }
      state.pos += url.length - proto.length;
      return true;
    }
    function newline(state, silent) {
      let pos = state.pos;
      if (state.src.charCodeAt(pos) !== 10) {
        return false;
      }
      const pmax = state.pending.length - 1;
      const max = state.posMax;
      if (!silent) {
        if (pmax >= 0 && state.pending.charCodeAt(pmax) === 32) {
          if (pmax >= 1 && state.pending.charCodeAt(pmax - 1) === 32) {
            let ws = pmax - 1;
            while (ws >= 1 && state.pending.charCodeAt(ws - 1) === 32) ws--;
            state.pending = state.pending.slice(0, ws);
            state.push("hardbreak", "br", 0);
          } else {
            state.pending = state.pending.slice(0, -1);
            state.push("softbreak", "br", 0);
          }
        } else {
          state.push("softbreak", "br", 0);
        }
      }
      pos++;
      while (pos < max && isSpace(state.src.charCodeAt(pos))) {
        pos++;
      }
      state.pos = pos;
      return true;
    }
    var ESCAPED = [];
    for (let i = 0; i < 256; i++) {
      ESCAPED.push(0);
    }
    "\\!\"#$%&'()*+,./:;<=>?@[]^_`{|}~-".split("").forEach(function(ch) {
      ESCAPED[ch.charCodeAt(0)] = 1;
    });
    function escape(state, silent) {
      let pos = state.pos;
      const max = state.posMax;
      if (state.src.charCodeAt(pos) !== 92) return false;
      pos++;
      if (pos >= max) return false;
      let ch1 = state.src.charCodeAt(pos);
      if (ch1 === 10) {
        if (!silent) {
          state.push("hardbreak", "br", 0);
        }
        pos++;
        while (pos < max) {
          ch1 = state.src.charCodeAt(pos);
          if (!isSpace(ch1)) break;
          pos++;
        }
        state.pos = pos;
        return true;
      }
      let escapedStr = state.src[pos];
      if (ch1 >= 55296 && ch1 <= 56319 && pos + 1 < max) {
        const ch2 = state.src.charCodeAt(pos + 1);
        if (ch2 >= 56320 && ch2 <= 57343) {
          escapedStr += state.src[pos + 1];
          pos++;
        }
      }
      const origStr = "\\" + escapedStr;
      if (!silent) {
        const token = state.push("text_special", "", 0);
        if (ch1 < 256 && ESCAPED[ch1] !== 0) {
          token.content = escapedStr;
        } else {
          token.content = origStr;
        }
        token.markup = origStr;
        token.info = "escape";
      }
      state.pos = pos + 1;
      return true;
    }
    function backtick(state, silent) {
      let pos = state.pos;
      const ch = state.src.charCodeAt(pos);
      if (ch !== 96) {
        return false;
      }
      const start = pos;
      pos++;
      const max = state.posMax;
      while (pos < max && state.src.charCodeAt(pos) === 96) {
        pos++;
      }
      const marker = state.src.slice(start, pos);
      const openerLength = marker.length;
      if (state.backticksScanned && (state.backticks[openerLength] || 0) <= start) {
        if (!silent) state.pending += marker;
        state.pos += openerLength;
        return true;
      }
      let matchEnd = pos;
      let matchStart;
      while ((matchStart = state.src.indexOf("`", matchEnd)) !== -1) {
        matchEnd = matchStart + 1;
        while (matchEnd < max && state.src.charCodeAt(matchEnd) === 96) {
          matchEnd++;
        }
        const closerLength = matchEnd - matchStart;
        if (closerLength === openerLength) {
          if (!silent) {
            const token = state.push("code_inline", "code", 0);
            token.markup = marker;
            token.content = state.src.slice(pos, matchStart).replace(/\n/g, " ").replace(/^ (.+) $/, "$1");
          }
          state.pos = matchEnd;
          return true;
        }
        state.backticks[closerLength] = matchStart;
      }
      state.backticksScanned = true;
      if (!silent) state.pending += marker;
      state.pos += openerLength;
      return true;
    }
    function strikethrough_tokenize(state, silent) {
      const start = state.pos;
      const marker = state.src.charCodeAt(start);
      if (silent) {
        return false;
      }
      if (marker !== 126) {
        return false;
      }
      const scanned = state.scanDelims(state.pos, true);
      let len = scanned.length;
      const ch = String.fromCharCode(marker);
      if (len < 2) {
        return false;
      }
      let token;
      if (len % 2) {
        token = state.push("text", "", 0);
        token.content = ch;
        len--;
      }
      for (let i = 0; i < len; i += 2) {
        token = state.push("text", "", 0);
        token.content = ch + ch;
        state.delimiters.push({
          marker,
          length: 0,
          // disable "rule of 3" length checks meant for emphasis
          token: state.tokens.length - 1,
          end: -1,
          open: scanned.can_open,
          close: scanned.can_close
        });
      }
      state.pos += scanned.length;
      return true;
    }
    function postProcess$1(state, delimiters) {
      let token;
      const loneMarkers = [];
      const max = delimiters.length;
      for (let i = 0; i < max; i++) {
        const startDelim = delimiters[i];
        if (startDelim.marker !== 126) {
          continue;
        }
        if (startDelim.end === -1) {
          continue;
        }
        const endDelim = delimiters[startDelim.end];
        token = state.tokens[startDelim.token];
        token.type = "s_open";
        token.tag = "s";
        token.nesting = 1;
        token.markup = "~~";
        token.content = "";
        token = state.tokens[endDelim.token];
        token.type = "s_close";
        token.tag = "s";
        token.nesting = -1;
        token.markup = "~~";
        token.content = "";
        if (state.tokens[endDelim.token - 1].type === "text" && state.tokens[endDelim.token - 1].content === "~") {
          loneMarkers.push(endDelim.token - 1);
        }
      }
      while (loneMarkers.length) {
        const i = loneMarkers.pop();
        let j = i + 1;
        while (j < state.tokens.length && state.tokens[j].type === "s_close") {
          j++;
        }
        j--;
        if (i !== j) {
          token = state.tokens[j];
          state.tokens[j] = state.tokens[i];
          state.tokens[i] = token;
        }
      }
    }
    function strikethrough_postProcess(state) {
      const tokens_meta = state.tokens_meta;
      const max = state.tokens_meta.length;
      postProcess$1(state, state.delimiters);
      for (let curr = 0; curr < max; curr++) {
        if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
          postProcess$1(state, tokens_meta[curr].delimiters);
        }
      }
    }
    var r_strikethrough = {
      tokenize: strikethrough_tokenize,
      postProcess: strikethrough_postProcess
    };
    function emphasis_tokenize(state, silent) {
      const start = state.pos;
      const marker = state.src.charCodeAt(start);
      if (silent) {
        return false;
      }
      if (marker !== 95 && marker !== 42) {
        return false;
      }
      const scanned = state.scanDelims(state.pos, marker === 42);
      for (let i = 0; i < scanned.length; i++) {
        const token = state.push("text", "", 0);
        token.content = String.fromCharCode(marker);
        state.delimiters.push({
          // Char code of the starting marker (number).
          //
          marker,
          // Total length of these series of delimiters.
          //
          length: scanned.length,
          // A position of the token this delimiter corresponds to.
          //
          token: state.tokens.length - 1,
          // If this delimiter is matched as a valid opener, `end` will be
          // equal to its position, otherwise it's `-1`.
          //
          end: -1,
          // Boolean flags that determine if this delimiter could open or close
          // an emphasis.
          //
          open: scanned.can_open,
          close: scanned.can_close
        });
      }
      state.pos += scanned.length;
      return true;
    }
    function postProcess(state, delimiters) {
      const max = delimiters.length;
      for (let i = max - 1; i >= 0; i--) {
        const startDelim = delimiters[i];
        if (startDelim.marker !== 95 && startDelim.marker !== 42) {
          continue;
        }
        if (startDelim.end === -1) {
          continue;
        }
        const endDelim = delimiters[startDelim.end];
        const isStrong = i > 0 && delimiters[i - 1].end === startDelim.end + 1 && // check that first two markers match and adjacent
        delimiters[i - 1].marker === startDelim.marker && delimiters[i - 1].token === startDelim.token - 1 && // check that last two markers are adjacent (we can safely assume they match)
        delimiters[startDelim.end + 1].token === endDelim.token + 1;
        const ch = String.fromCharCode(startDelim.marker);
        const token_o = state.tokens[startDelim.token];
        token_o.type = isStrong ? "strong_open" : "em_open";
        token_o.tag = isStrong ? "strong" : "em";
        token_o.nesting = 1;
        token_o.markup = isStrong ? ch + ch : ch;
        token_o.content = "";
        const token_c = state.tokens[endDelim.token];
        token_c.type = isStrong ? "strong_close" : "em_close";
        token_c.tag = isStrong ? "strong" : "em";
        token_c.nesting = -1;
        token_c.markup = isStrong ? ch + ch : ch;
        token_c.content = "";
        if (isStrong) {
          state.tokens[delimiters[i - 1].token].content = "";
          state.tokens[delimiters[startDelim.end + 1].token].content = "";
          i--;
        }
      }
    }
    function emphasis_post_process(state) {
      const tokens_meta = state.tokens_meta;
      const max = state.tokens_meta.length;
      postProcess(state, state.delimiters);
      for (let curr = 0; curr < max; curr++) {
        if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
          postProcess(state, tokens_meta[curr].delimiters);
        }
      }
    }
    var r_emphasis = {
      tokenize: emphasis_tokenize,
      postProcess: emphasis_post_process
    };
    function link(state, silent) {
      let code2, label, res, ref;
      let href = "";
      let title = "";
      let start = state.pos;
      let parseReference = true;
      if (state.src.charCodeAt(state.pos) !== 91) {
        return false;
      }
      const oldPos = state.pos;
      const max = state.posMax;
      const labelStart = state.pos + 1;
      const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, true);
      if (labelEnd < 0) {
        return false;
      }
      let pos = labelEnd + 1;
      if (pos < max && state.src.charCodeAt(pos) === 40) {
        parseReference = false;
        pos++;
        for (; pos < max; pos++) {
          code2 = state.src.charCodeAt(pos);
          if (!isSpace(code2) && code2 !== 10) {
            break;
          }
        }
        if (pos >= max) {
          return false;
        }
        start = pos;
        res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
        if (res.ok) {
          href = state.md.normalizeLink(res.str);
          if (state.md.validateLink(href)) {
            pos = res.pos;
          } else {
            href = "";
          }
          start = pos;
          for (; pos < max; pos++) {
            code2 = state.src.charCodeAt(pos);
            if (!isSpace(code2) && code2 !== 10) {
              break;
            }
          }
          res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
          if (pos < max && start !== pos && res.ok) {
            title = res.str;
            pos = res.pos;
            for (; pos < max; pos++) {
              code2 = state.src.charCodeAt(pos);
              if (!isSpace(code2) && code2 !== 10) {
                break;
              }
            }
          }
        }
        if (pos >= max || state.src.charCodeAt(pos) !== 41) {
          parseReference = true;
        }
        pos++;
      }
      if (parseReference) {
        if (typeof state.env.references === "undefined") {
          return false;
        }
        if (pos < max && state.src.charCodeAt(pos) === 91) {
          start = pos + 1;
          pos = state.md.helpers.parseLinkLabel(state, pos);
          if (pos >= 0) {
            label = state.src.slice(start, pos++);
          } else {
            pos = labelEnd + 1;
          }
        } else {
          pos = labelEnd + 1;
        }
        if (!label) {
          label = state.src.slice(labelStart, labelEnd);
        }
        ref = state.env.references[normalizeReference(label)];
        if (!ref) {
          state.pos = oldPos;
          return false;
        }
        href = ref.href;
        title = ref.title;
      }
      if (!silent) {
        state.pos = labelStart;
        state.posMax = labelEnd;
        const token_o = state.push("link_open", "a", 1);
        const attrs = [["href", href]];
        token_o.attrs = attrs;
        if (title) {
          attrs.push(["title", title]);
        }
        state.linkLevel++;
        state.md.inline.tokenize(state);
        state.linkLevel--;
        state.push("link_close", "a", -1);
      }
      state.pos = pos;
      state.posMax = max;
      return true;
    }
    function image(state, silent) {
      let code2, content, label, pos, ref, res, title, start;
      let href = "";
      const oldPos = state.pos;
      const max = state.posMax;
      if (state.src.charCodeAt(state.pos) !== 33) {
        return false;
      }
      if (state.src.charCodeAt(state.pos + 1) !== 91) {
        return false;
      }
      const labelStart = state.pos + 2;
      const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos + 1, false);
      if (labelEnd < 0) {
        return false;
      }
      pos = labelEnd + 1;
      if (pos < max && state.src.charCodeAt(pos) === 40) {
        pos++;
        for (; pos < max; pos++) {
          code2 = state.src.charCodeAt(pos);
          if (!isSpace(code2) && code2 !== 10) {
            break;
          }
        }
        if (pos >= max) {
          return false;
        }
        start = pos;
        res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
        if (res.ok) {
          href = state.md.normalizeLink(res.str);
          if (state.md.validateLink(href)) {
            pos = res.pos;
          } else {
            href = "";
          }
        }
        start = pos;
        for (; pos < max; pos++) {
          code2 = state.src.charCodeAt(pos);
          if (!isSpace(code2) && code2 !== 10) {
            break;
          }
        }
        res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
        if (pos < max && start !== pos && res.ok) {
          title = res.str;
          pos = res.pos;
          for (; pos < max; pos++) {
            code2 = state.src.charCodeAt(pos);
            if (!isSpace(code2) && code2 !== 10) {
              break;
            }
          }
        } else {
          title = "";
        }
        if (pos >= max || state.src.charCodeAt(pos) !== 41) {
          state.pos = oldPos;
          return false;
        }
        pos++;
      } else {
        if (typeof state.env.references === "undefined") {
          return false;
        }
        if (pos < max && state.src.charCodeAt(pos) === 91) {
          start = pos + 1;
          pos = state.md.helpers.parseLinkLabel(state, pos);
          if (pos >= 0) {
            label = state.src.slice(start, pos++);
          } else {
            pos = labelEnd + 1;
          }
        } else {
          pos = labelEnd + 1;
        }
        if (!label) {
          label = state.src.slice(labelStart, labelEnd);
        }
        ref = state.env.references[normalizeReference(label)];
        if (!ref) {
          state.pos = oldPos;
          return false;
        }
        href = ref.href;
        title = ref.title;
      }
      if (!silent) {
        content = state.src.slice(labelStart, labelEnd);
        const tokens = [];
        state.md.inline.parse(content, state.md, state.env, tokens);
        const token = state.push("image", "img", 0);
        const attrs = [["src", href], ["alt", ""]];
        token.attrs = attrs;
        token.children = tokens;
        token.content = content;
        if (title) {
          attrs.push(["title", title]);
        }
      }
      state.pos = pos;
      state.posMax = max;
      return true;
    }
    var EMAIL_RE = /^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
    var AUTOLINK_RE = /^([a-zA-Z][a-zA-Z0-9+.-]{1,31}):([^<>\x00-\x20]*)$/;
    function autolink(state, silent) {
      let pos = state.pos;
      if (state.src.charCodeAt(pos) !== 60) {
        return false;
      }
      const start = state.pos;
      const max = state.posMax;
      for (; ; ) {
        if (++pos >= max) return false;
        const ch = state.src.charCodeAt(pos);
        if (ch === 60) return false;
        if (ch === 62) break;
      }
      const url = state.src.slice(start + 1, pos);
      if (AUTOLINK_RE.test(url)) {
        const fullUrl = state.md.normalizeLink(url);
        if (!state.md.validateLink(fullUrl)) {
          return false;
        }
        if (!silent) {
          const token_o = state.push("link_open", "a", 1);
          token_o.attrs = [["href", fullUrl]];
          token_o.markup = "autolink";
          token_o.info = "auto";
          const token_t = state.push("text", "", 0);
          token_t.content = state.md.normalizeLinkText(url);
          const token_c = state.push("link_close", "a", -1);
          token_c.markup = "autolink";
          token_c.info = "auto";
        }
        state.pos += url.length + 2;
        return true;
      }
      if (EMAIL_RE.test(url)) {
        const fullUrl = state.md.normalizeLink("mailto:" + url);
        if (!state.md.validateLink(fullUrl)) {
          return false;
        }
        if (!silent) {
          const token_o = state.push("link_open", "a", 1);
          token_o.attrs = [["href", fullUrl]];
          token_o.markup = "autolink";
          token_o.info = "auto";
          const token_t = state.push("text", "", 0);
          token_t.content = state.md.normalizeLinkText(url);
          const token_c = state.push("link_close", "a", -1);
          token_c.markup = "autolink";
          token_c.info = "auto";
        }
        state.pos += url.length + 2;
        return true;
      }
      return false;
    }
    function isLinkOpen(str) {
      return /^<a[>\s]/i.test(str);
    }
    function isLinkClose(str) {
      return /^<\/a\s*>/i.test(str);
    }
    function isLetter(ch) {
      const lc = ch | 32;
      return lc >= 97 && lc <= 122;
    }
    function html_inline(state, silent) {
      if (!state.md.options.html) {
        return false;
      }
      const max = state.posMax;
      const pos = state.pos;
      if (state.src.charCodeAt(pos) !== 60 || pos + 2 >= max) {
        return false;
      }
      const ch = state.src.charCodeAt(pos + 1);
      if (ch !== 33 && ch !== 63 && ch !== 47 && !isLetter(ch)) {
        return false;
      }
      const match = state.src.slice(pos).match(HTML_TAG_RE);
      if (!match) {
        return false;
      }
      if (!silent) {
        const token = state.push("html_inline", "", 0);
        token.content = match[0];
        if (isLinkOpen(token.content)) state.linkLevel++;
        if (isLinkClose(token.content)) state.linkLevel--;
      }
      state.pos += match[0].length;
      return true;
    }
    var DIGITAL_RE = /^&#((?:x[a-f0-9]{1,6}|[0-9]{1,7}));/i;
    var NAMED_RE = /^&([a-z][a-z0-9]{1,31});/i;
    function entity(state, silent) {
      const pos = state.pos;
      const max = state.posMax;
      if (state.src.charCodeAt(pos) !== 38) return false;
      if (pos + 1 >= max) return false;
      const ch = state.src.charCodeAt(pos + 1);
      if (ch === 35) {
        const match = state.src.slice(pos).match(DIGITAL_RE);
        if (match) {
          if (!silent) {
            const code2 = match[1][0].toLowerCase() === "x" ? parseInt(match[1].slice(1), 16) : parseInt(match[1], 10);
            const token = state.push("text_special", "", 0);
            token.content = isValidEntityCode(code2) ? fromCodePoint(code2) : fromCodePoint(65533);
            token.markup = match[0];
            token.info = "entity";
          }
          state.pos += match[0].length;
          return true;
        }
      } else {
        const match = state.src.slice(pos).match(NAMED_RE);
        if (match) {
          const decoded = entities.decodeHTML(match[0]);
          if (decoded !== match[0]) {
            if (!silent) {
              const token = state.push("text_special", "", 0);
              token.content = decoded;
              token.markup = match[0];
              token.info = "entity";
            }
            state.pos += match[0].length;
            return true;
          }
        }
      }
      return false;
    }
    function processDelimiters(delimiters) {
      const openersBottom = {};
      const max = delimiters.length;
      if (!max) return;
      let headerIdx = 0;
      let lastTokenIdx = -2;
      const jumps = [];
      for (let closerIdx = 0; closerIdx < max; closerIdx++) {
        const closer = delimiters[closerIdx];
        jumps.push(0);
        if (delimiters[headerIdx].marker !== closer.marker || lastTokenIdx !== closer.token - 1) {
          headerIdx = closerIdx;
        }
        lastTokenIdx = closer.token;
        closer.length = closer.length || 0;
        if (!closer.close) continue;
        if (!openersBottom.hasOwnProperty(closer.marker)) {
          openersBottom[closer.marker] = [-1, -1, -1, -1, -1, -1];
        }
        const minOpenerIdx = openersBottom[closer.marker][(closer.open ? 3 : 0) + closer.length % 3];
        let openerIdx = headerIdx - jumps[headerIdx] - 1;
        let newMinOpenerIdx = openerIdx;
        for (; openerIdx > minOpenerIdx; openerIdx -= jumps[openerIdx] + 1) {
          const opener = delimiters[openerIdx];
          if (opener.marker !== closer.marker) continue;
          if (opener.open && opener.end < 0) {
            let isOddMatch = false;
            if (opener.close || closer.open) {
              if ((opener.length + closer.length) % 3 === 0) {
                if (opener.length % 3 !== 0 || closer.length % 3 !== 0) {
                  isOddMatch = true;
                }
              }
            }
            if (!isOddMatch) {
              const lastJump = openerIdx > 0 && !delimiters[openerIdx - 1].open ? jumps[openerIdx - 1] + 1 : 0;
              jumps[closerIdx] = closerIdx - openerIdx + lastJump;
              jumps[openerIdx] = lastJump;
              closer.open = false;
              opener.end = closerIdx;
              opener.close = false;
              newMinOpenerIdx = -1;
              lastTokenIdx = -2;
              break;
            }
          }
        }
        if (newMinOpenerIdx !== -1) {
          openersBottom[closer.marker][(closer.open ? 3 : 0) + (closer.length || 0) % 3] = newMinOpenerIdx;
        }
      }
    }
    function link_pairs(state) {
      const tokens_meta = state.tokens_meta;
      const max = state.tokens_meta.length;
      processDelimiters(state.delimiters);
      for (let curr = 0; curr < max; curr++) {
        if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
          processDelimiters(tokens_meta[curr].delimiters);
        }
      }
    }
    function fragments_join(state) {
      let curr, last;
      let level = 0;
      const tokens = state.tokens;
      const max = state.tokens.length;
      for (curr = last = 0; curr < max; curr++) {
        if (tokens[curr].nesting < 0) level--;
        tokens[curr].level = level;
        if (tokens[curr].nesting > 0) level++;
        if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") {
          tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
        } else {
          if (curr !== last) {
            tokens[last] = tokens[curr];
          }
          last++;
        }
      }
      if (curr !== last) {
        tokens.length = last;
      }
    }
    var _rules = [["text", text], ["linkify", linkify], ["newline", newline], ["escape", escape], ["backticks", backtick], ["strikethrough", r_strikethrough.tokenize], ["emphasis", r_emphasis.tokenize], ["link", link], ["image", image], ["autolink", autolink], ["html_inline", html_inline], ["entity", entity]];
    var _rules2 = [
      ["balance_pairs", link_pairs],
      ["strikethrough", r_strikethrough.postProcess],
      ["emphasis", r_emphasis.postProcess],
      // rules for pairs separate '**' into its own text tokens, which may be left unused,
      // rule below merges unused segments back with the rest of the text
      ["fragments_join", fragments_join]
    ];
    function ParserInline() {
      this.ruler = new Ruler();
      for (let i = 0; i < _rules.length; i++) {
        this.ruler.push(_rules[i][0], _rules[i][1]);
      }
      this.ruler2 = new Ruler();
      for (let i = 0; i < _rules2.length; i++) {
        this.ruler2.push(_rules2[i][0], _rules2[i][1]);
      }
    }
    ParserInline.prototype.skipToken = function(state) {
      const pos = state.pos;
      const rules = this.ruler.getRules("");
      const len = rules.length;
      const maxNesting = state.md.options.maxNesting;
      const cache = state.cache;
      if (typeof cache[pos] !== "undefined") {
        state.pos = cache[pos];
        return;
      }
      let ok = false;
      if (state.level < maxNesting) {
        for (let i = 0; i < len; i++) {
          state.level++;
          ok = rules[i](state, true);
          state.level--;
          if (ok) {
            if (pos >= state.pos) {
              throw new Error("inline rule didn't increment state.pos");
            }
            break;
          }
        }
      } else {
        state.pos = state.posMax;
      }
      if (!ok) {
        state.pos++;
      }
      cache[pos] = state.pos;
    };
    ParserInline.prototype.tokenize = function(state) {
      const rules = this.ruler.getRules("");
      const len = rules.length;
      const end = state.posMax;
      const maxNesting = state.md.options.maxNesting;
      while (state.pos < end) {
        const prevPos = state.pos;
        let ok = false;
        if (state.level < maxNesting) {
          for (let i = 0; i < len; i++) {
            ok = rules[i](state, false);
            if (ok) {
              if (prevPos >= state.pos) {
                throw new Error("inline rule didn't increment state.pos");
              }
              break;
            }
          }
        }
        if (ok) {
          if (state.pos >= end) {
            break;
          }
          continue;
        }
        state.pending += state.src[state.pos++];
      }
      if (state.pending) {
        state.pushPending();
      }
    };
    ParserInline.prototype.parse = function(str, md, env, outTokens) {
      const state = new this.State(str, md, env, outTokens);
      this.tokenize(state);
      const rules = this.ruler2.getRules("");
      const len = rules.length;
      for (let i = 0; i < len; i++) {
        rules[i](state);
      }
    };
    ParserInline.prototype.State = StateInline;
    var cfg_default = {
      options: {
        // Enable HTML tags in source
        html: false,
        // Use '/' to close single tags (<br />)
        xhtmlOut: false,
        // Convert '\n' in paragraphs into <br>
        breaks: false,
        // CSS language prefix for fenced blocks
        langPrefix: "language-",
        // autoconvert URL-like texts to links
        linkify: false,
        // Enable some language-neutral replacements + quotes beautification
        typographer: false,
        // Double + single quotes replacement pairs, when typographer enabled,
        // and smartquotes on. Could be either a String or an Array.
        //
        // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
        // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
        quotes: "\u201C\u201D\u2018\u2019",
        /* “”‘’ */
        // Highlighter function. Should return escaped HTML,
        // or '' if the source string is not changed and should be escaped externaly.
        // If result starts with <pre... internal wrapper is skipped.
        //
        // function (/*str, lang*/) { return ''; }
        //
        highlight: null,
        // Internal protection, recursion limit
        maxNesting: 100
      },
      components: {
        core: {},
        block: {},
        inline: {}
      }
    };
    var cfg_zero = {
      options: {
        // Enable HTML tags in source
        html: false,
        // Use '/' to close single tags (<br />)
        xhtmlOut: false,
        // Convert '\n' in paragraphs into <br>
        breaks: false,
        // CSS language prefix for fenced blocks
        langPrefix: "language-",
        // autoconvert URL-like texts to links
        linkify: false,
        // Enable some language-neutral replacements + quotes beautification
        typographer: false,
        // Double + single quotes replacement pairs, when typographer enabled,
        // and smartquotes on. Could be either a String or an Array.
        //
        // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
        // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
        quotes: "\u201C\u201D\u2018\u2019",
        /* “”‘’ */
        // Highlighter function. Should return escaped HTML,
        // or '' if the source string is not changed and should be escaped externaly.
        // If result starts with <pre... internal wrapper is skipped.
        //
        // function (/*str, lang*/) { return ''; }
        //
        highlight: null,
        // Internal protection, recursion limit
        maxNesting: 20
      },
      components: {
        core: {
          rules: ["normalize", "block", "inline", "text_join"]
        },
        block: {
          rules: ["paragraph"]
        },
        inline: {
          rules: ["text"],
          rules2: ["balance_pairs", "fragments_join"]
        }
      }
    };
    var cfg_commonmark = {
      options: {
        // Enable HTML tags in source
        html: true,
        // Use '/' to close single tags (<br />)
        xhtmlOut: true,
        // Convert '\n' in paragraphs into <br>
        breaks: false,
        // CSS language prefix for fenced blocks
        langPrefix: "language-",
        // autoconvert URL-like texts to links
        linkify: false,
        // Enable some language-neutral replacements + quotes beautification
        typographer: false,
        // Double + single quotes replacement pairs, when typographer enabled,
        // and smartquotes on. Could be either a String or an Array.
        //
        // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
        // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
        quotes: "\u201C\u201D\u2018\u2019",
        /* “”‘’ */
        // Highlighter function. Should return escaped HTML,
        // or '' if the source string is not changed and should be escaped externaly.
        // If result starts with <pre... internal wrapper is skipped.
        //
        // function (/*str, lang*/) { return ''; }
        //
        highlight: null,
        // Internal protection, recursion limit
        maxNesting: 20
      },
      components: {
        core: {
          rules: ["normalize", "block", "inline", "text_join"]
        },
        block: {
          rules: ["blockquote", "code", "fence", "heading", "hr", "html_block", "lheading", "list", "reference", "paragraph"]
        },
        inline: {
          rules: ["autolink", "backticks", "emphasis", "entity", "escape", "html_inline", "image", "link", "newline", "text"],
          rules2: ["balance_pairs", "emphasis", "fragments_join"]
        }
      }
    };
    var config = {
      default: cfg_default,
      zero: cfg_zero,
      commonmark: cfg_commonmark
    };
    var BAD_PROTO_RE = /^(vbscript|javascript|file|data):/;
    var GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/;
    function validateLink(url) {
      const str = url.trim().toLowerCase();
      return BAD_PROTO_RE.test(str) ? GOOD_DATA_RE.test(str) : true;
    }
    var RECODE_HOSTNAME_FOR = ["http:", "https:", "mailto:"];
    function normalizeLink(url) {
      const parsed = mdurl__namespace.parse(url, true);
      if (parsed.hostname) {
        if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
          try {
            parsed.hostname = punycode.toASCII(parsed.hostname);
          } catch (er) {
          }
        }
      }
      return mdurl__namespace.encode(mdurl__namespace.format(parsed));
    }
    function normalizeLinkText(url) {
      const parsed = mdurl__namespace.parse(url, true);
      if (parsed.hostname) {
        if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
          try {
            parsed.hostname = punycode.toUnicode(parsed.hostname);
          } catch (er) {
          }
        }
      }
      return mdurl__namespace.decode(mdurl__namespace.format(parsed), mdurl__namespace.decode.defaultChars + "%");
    }
    function MarkdownIt(presetName, options) {
      if (!(this instanceof MarkdownIt)) {
        return new MarkdownIt(presetName, options);
      }
      if (!options) {
        if (!isString(presetName)) {
          options = presetName || {};
          presetName = "default";
        }
      }
      this.inline = new ParserInline();
      this.block = new ParserBlock();
      this.core = new Core();
      this.renderer = new Renderer();
      this.linkify = new LinkifyIt();
      this.validateLink = validateLink;
      this.normalizeLink = normalizeLink;
      this.normalizeLinkText = normalizeLinkText;
      this.utils = utils;
      this.helpers = assign({}, helpers);
      this.options = {};
      this.configure(presetName);
      if (options) {
        this.set(options);
      }
    }
    MarkdownIt.prototype.set = function(options) {
      assign(this.options, options);
      return this;
    };
    MarkdownIt.prototype.configure = function(presets) {
      const self = this;
      if (isString(presets)) {
        const presetName = presets;
        presets = config[presetName];
        if (!presets) {
          throw new Error('Wrong `markdown-it` preset "' + presetName + '", check name');
        }
      }
      if (!presets) {
        throw new Error("Wrong `markdown-it` preset, can't be empty");
      }
      if (presets.options) {
        self.set(presets.options);
      }
      if (presets.components) {
        Object.keys(presets.components).forEach(function(name) {
          if (presets.components[name].rules) {
            self[name].ruler.enableOnly(presets.components[name].rules);
          }
          if (presets.components[name].rules2) {
            self[name].ruler2.enableOnly(presets.components[name].rules2);
          }
        });
      }
      return this;
    };
    MarkdownIt.prototype.enable = function(list2, ignoreInvalid) {
      let result = [];
      if (!Array.isArray(list2)) {
        list2 = [list2];
      }
      ["core", "block", "inline"].forEach(function(chain) {
        result = result.concat(this[chain].ruler.enable(list2, true));
      }, this);
      result = result.concat(this.inline.ruler2.enable(list2, true));
      const missed = list2.filter(function(name) {
        return result.indexOf(name) < 0;
      });
      if (missed.length && !ignoreInvalid) {
        throw new Error("MarkdownIt. Failed to enable unknown rule(s): " + missed);
      }
      return this;
    };
    MarkdownIt.prototype.disable = function(list2, ignoreInvalid) {
      let result = [];
      if (!Array.isArray(list2)) {
        list2 = [list2];
      }
      ["core", "block", "inline"].forEach(function(chain) {
        result = result.concat(this[chain].ruler.disable(list2, true));
      }, this);
      result = result.concat(this.inline.ruler2.disable(list2, true));
      const missed = list2.filter(function(name) {
        return result.indexOf(name) < 0;
      });
      if (missed.length && !ignoreInvalid) {
        throw new Error("MarkdownIt. Failed to disable unknown rule(s): " + missed);
      }
      return this;
    };
    MarkdownIt.prototype.use = function(plugin) {
      const args = [this].concat(Array.prototype.slice.call(arguments, 1));
      plugin.apply(plugin, args);
      return this;
    };
    MarkdownIt.prototype.parse = function(src, env) {
      if (typeof src !== "string") {
        throw new Error("Input data should be a String");
      }
      const state = new this.core.State(src, this, env);
      this.core.process(state);
      return state.tokens;
    };
    MarkdownIt.prototype.render = function(src, env) {
      env = env || {};
      return this.renderer.render(this.parse(src, env), this.options, env);
    };
    MarkdownIt.prototype.parseInline = function(src, env) {
      const state = new this.core.State(src, this, env);
      state.inlineMode = true;
      this.core.process(state);
      return state.tokens;
    };
    MarkdownIt.prototype.renderInline = function(src, env) {
      env = env || {};
      return this.renderer.render(this.parseInline(src, env), this.options, env);
    };
    module2.exports = MarkdownIt;
  }
});

// integrations/markdown-toolkit/source/copy-as-html.js
var require_copy_as_html = __commonJS({
  "integrations/markdown-toolkit/source/copy-as-html.js"(exports2, module2) {
    "use strict";
    var vscode2 = require("vscode");
    var cp = require("node:child_process");
    var fs = require("node:fs");
    var os = require("node:os");
    var path = require("node:path");
    var MarkdownIt = require_index_cjs4();
    var markdown = new MarkdownIt({ html: true, linkify: true });
    var stylesheet = `body,div{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.6;color:#24292e}code{font-family:Consolas,monospace;background:#f1f3f5;padding:.2em .4em}pre{background:#f6f8fa;padding:16px;border-radius:6px}pre code{background:transparent;padding:0}table{border-collapse:collapse;margin:16px 0}th,td{border:1px solid #dfe2e5;padding:6px 13px}th{background:#f6f8fa}blockquote{border-left:4px solid #dfe2e5;padding:0 16px;color:#57606a}img{max-width:100%}`;
    function markdownToHtml(source) {
      let html = markdown.render(source);
      html = html.replace(/<li>\s*\[ \]\s*/g, '<li style="list-style:none"><input type="checkbox" disabled> ').replace(/<li>\s*\[x\]\s*/gi, '<li style="list-style:none"><input type="checkbox" disabled checked> ');
      return `<div><style>${stylesheet}</style>${html}</div>`;
    }
    function execFile(command, args) {
      return new Promise((resolve, reject) => cp.execFile(command, args, { timeout: 1e4 }, (error, stdout, stderr) => {
        if (error) reject(new Error(stderr || error.message));
        else resolve(stdout);
      }));
    }
    function cfHtml(html) {
      const header = "Version:0.9\r\nStartHTML:0000000000\r\nEndHTML:0000000000\r\nStartFragment:0000000000\r\nEndFragment:0000000000\r\n";
      const before = "<html><body>\r\n<!--StartFragment-->";
      const after = "<!--EndFragment-->\r\n</body></html>";
      const startHtml = Buffer.byteLength(header);
      const startFragment = startHtml + Buffer.byteLength(before);
      const endFragment = startFragment + Buffer.byteLength(html);
      const endHtml = endFragment + Buffer.byteLength(after);
      return `Version:0.9\r
StartHTML:${String(startHtml).padStart(10, "0")}\r
EndHTML:${String(endHtml).padStart(10, "0")}\r
StartFragment:${String(startFragment).padStart(10, "0")}\r
EndFragment:${String(endFragment).padStart(10, "0")}\r
${before}${html}${after}`;
    }
    async function writeRichClipboard(html, text) {
      const id = `gmc-markdown-${process.pid}-${Date.now()}`;
      const htmlFile = path.join(os.tmpdir(), `${id}.html`);
      const textFile = path.join(os.tmpdir(), `${id}.txt`);
      const scriptFile = path.join(os.tmpdir(), `${id}.${process.platform === "win32" ? "ps1" : "js"}`);
      fs.writeFileSync(htmlFile, process.platform === "win32" ? cfHtml(html) : html, "utf8");
      fs.writeFileSync(textFile, text, "utf8");
      try {
        if (process.platform === "win32") {
          fs.writeFileSync(scriptFile, [
            "Add-Type -AssemblyName System.Windows.Forms",
            `$html=[IO.File]::ReadAllText('${htmlFile.replace(/'/g, "''")}')`,
            `$text=[IO.File]::ReadAllText('${textFile.replace(/'/g, "''")}')`,
            "$data=New-Object Windows.Forms.DataObject",
            "$data.SetData([Windows.Forms.DataFormats]::Html,$html)",
            "$data.SetData([Windows.Forms.DataFormats]::UnicodeText,$text)",
            "[Windows.Forms.Clipboard]::SetDataObject($data,$true)"
          ].join("\r\n"));
          await execFile("powershell", ["-NoProfile", "-NonInteractive", "-Sta", "-ExecutionPolicy", "Bypass", "-File", scriptFile]);
        } else if (process.platform === "darwin") {
          fs.writeFileSync(scriptFile, `ObjC.import('AppKit');ObjC.import('Foundation');var p=$.NSPasteboard.generalPasteboard;p.clearContents;p.setStringForType($.NSString.stringWithContentsOfFileEncodingError('${textFile}',4,null),$.NSPasteboardTypeString);p.setStringForType($.NSString.stringWithContentsOfFileEncodingError('${htmlFile}',4,null),$.NSPasteboardTypeHTML);`);
          await execFile("osascript", ["-l", "JavaScript", scriptFile]);
        } else {
          await execFile("sh", ["-c", `command -v wl-copy >/dev/null && wl-copy --type text/html < '${htmlFile}' || xclip -selection clipboard -t text/html < '${htmlFile}'`]);
        }
      } finally {
        for (const file of [htmlFile, textFile, scriptFile]) try {
          fs.unlinkSync(file);
        } catch {
        }
      }
    }
    async function copyTextAsHtml(text) {
      if (!text.trim()) return;
      const html = markdownToHtml(text);
      try {
        await writeRichClipboard(html, text);
        vscode2.window.setStatusBarMessage("$(clippy) Copied as HTML", 2e3);
      } catch {
        await vscode2.env.clipboard.writeText(html);
        vscode2.window.showWarningMessage("Copied HTML as text because a rich clipboard provider was unavailable.");
      }
    }
    async function copyAsHtml2(uri) {
      if (uri) {
        return copyTextAsHtml(new TextDecoder().decode(await vscode2.workspace.fs.readFile(uri)));
      }
      const editor = vscode2.window.activeTextEditor;
      if (!editor) return;
      const text = editor.selection.isEmpty ? editor.document.lineAt(editor.selection.active.line).text : editor.document.getText(editor.selection);
      return copyTextAsHtml(text);
    }
    module2.exports = { copyAsHtml: copyAsHtml2, markdownToHtml };
  }
});

// integrations/markdown-toolkit/source/export.js
var require_export = __commonJS({
  "integrations/markdown-toolkit/source/export.js"(exports2, module2) {
    "use strict";
    var vscode2 = require("vscode");
    var cp = require("node:child_process");
    var fs = require("node:fs");
    var os = require("node:os");
    var path = require("node:path");
    var { pathToFileURL } = require("node:url");
    var MarkdownIt = require_index_cjs4();
    var md = new MarkdownIt({ html: true, linkify: true, typographer: false });
    function parseOptions(info) {
      const options = {};
      for (const match of info.matchAll(/([a-zA-Z_][\w-]*)=("[^"]*"|'[^']*'|\S+)/g)) {
        options[match[1]] = match[2].replace(/^(?:"|')|(?:"|')$/g, "");
      }
      return options;
    }
    function escapeHtml(value) {
      return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    }
    var GmcExportRenderer = class {
      constructor(context) {
        this.context = context;
        this.sequence = 0;
        this.pendingRenders = /* @__PURE__ */ new Map();
        this.pendingExports = /* @__PURE__ */ new Map();
        this.panel = vscode2.window.createWebviewPanel(
          "gmcMarkdownExportRenderer",
          "Rendering Markdown export\u2026",
          { viewColumn: vscode2.ViewColumn.Beside, preserveFocus: true },
          { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [context.extensionUri] }
        );
        this.ready = new Promise((resolve) => {
          this.resolveReady = resolve;
        });
        this.panel.webview.html = this.html(this.panel.webview);
        this.panel.webview.onDidReceiveMessage((message) => {
          if (message.type === "ready") this.resolveReady?.();
          if (message.type === "rendered") {
            const pending = this.pendingRenders.get(message.renderId);
            if (pending) {
              clearTimeout(pending.timer);
              this.pendingRenders.delete(message.renderId);
              pending.resolve();
            }
          }
          if (message.type === "exportResult") {
            const pending = this.pendingExports.get(message.requestId);
            if (pending) {
              clearTimeout(pending.timer);
              this.pendingExports.delete(message.requestId);
              pending.resolve(message.dataUrl);
            }
          }
          if (message.type === "exportError") {
            const pending = this.pendingExports.get(message.requestId);
            if (pending) {
              clearTimeout(pending.timer);
              this.pendingExports.delete(message.requestId);
              pending.reject(new Error(message.message));
            }
          }
        });
      }
      dispose() {
        this.panel.dispose();
      }
      async render(source, options) {
        await this.ready;
        const renderId = `markdown-export-render-${++this.sequence}`;
        const rendered = new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingRenders.delete(renderId);
            reject(new Error("Timed out rendering a GMC diagram."));
          }, 2e4);
          this.pendingRenders.set(renderId, { resolve, reject, timer });
        });
        await this.panel.webview.postMessage({
          type: "render",
          renderId,
          source,
          name: options.id || "diagram",
          view: options.view,
          theme: options.theme,
          editable: false,
          version: String(this.context.extension.packageJSON.version || "0.0.0")
        });
        await rendered;
        const requestId = `markdown-export-image-${++this.sequence}`;
        const exported = new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingExports.delete(requestId);
            reject(new Error("Timed out exporting a GMC diagram."));
          }, 2e4);
          this.pendingExports.set(requestId, { resolve, reject, timer });
        });
        await this.panel.webview.postMessage({
          type: "export",
          requestId,
          width: Math.max(320, Math.min(8192, Number(options.width) || 1600)),
          height: Math.max(240, Math.min(8192, Number(options.height) || 1e3)),
          theme: options.theme
        });
        return exported;
      }
      html(webview) {
        const script = webview.asWebviewUri(vscode2.Uri.joinPath(this.context.extensionUri, "dist", "webview", "assets", "webview.js"));
        const style = webview.asWebviewUri(vscode2.Uri.joinPath(this.context.extensionUri, "dist", "webview", "assets", "webview.css"));
        const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${style}"></head><body><div id="root"></div><script nonce="${nonce}" type="module" src="${script}"></script></body></html>`;
      }
    };
    async function replaceGmcFences(source, renderer) {
      const regex = /^(`{3,}|~{3,})\s*(gmc|graphmodel)\b([^\n]*)\r?\n([\s\S]*?)^\1\s*$/gmi;
      const matches = [...source.matchAll(regex)];
      if (!matches.length) return source;
      let cursor = 0;
      let result = "";
      for (let index = 0; index < matches.length; index++) {
        const match = matches[index];
        result += source.slice(cursor, match.index);
        const options = parseOptions(match[3] || "");
        options.id ||= `diagram-${index + 1}`;
        const dataUrl = await renderer.render(match[4], options);
        result += `<figure class="gmc-export-diagram"><img src="${dataUrl}" alt="GMC diagram: ${escapeHtml(options.id)}"></figure>`;
        cursor = match.index + match[0].length;
      }
      return result + source.slice(cursor);
    }
    async function replaceGmcFencesWithFiles(source, renderer, outputDirectory) {
      const regex = /^(`{3,}|~{3,})\s*(gmc|graphmodel)\b([^\n]*)\r?\n([\s\S]*?)^\1\s*$/gmi;
      const matches = [...source.matchAll(regex)];
      let cursor = 0;
      let result = "";
      for (let index = 0; index < matches.length; index++) {
        const match = matches[index];
        result += source.slice(cursor, match.index);
        const options = parseOptions(match[3] || "");
        options.id ||= `diagram-${index + 1}`;
        const dataUrl = await renderer.render(match[4], options);
        const comma = dataUrl.indexOf(",");
        if (comma < 0) throw new Error(`Could not export GMC diagram ${options.id}.`);
        const filename = `gmc-${String(index + 1).padStart(3, "0")}.png`;
        fs.writeFileSync(path.join(outputDirectory, filename), Buffer.from(dataUrl.slice(comma + 1), "base64"));
        result += `![GMC diagram: ${options.id}](${filename})`;
        cursor = match.index + match[0].length;
      }
      return result + source.slice(cursor);
    }
    function documentHtml(title, body, dark) {
      const colors = dark ? "color:#d4d4d4;background:#1e1e1e;--border:#444;--code:#2b2b2b;--link:#4daafc" : "color:#24292f;background:#fff;--border:#d0d7de;--code:#f6f8fa;--link:#0969da";
      return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><style>
@page{margin:18mm}*{box-sizing:border-box}body{${colors};font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;max-width:1100px;margin:0 auto;padding:32px}a{color:var(--link)}img{max-width:100%;height:auto}h1,h2{border-bottom:1px solid var(--border);padding-bottom:.3em}pre{background:var(--code);padding:16px;overflow:auto;border-radius:6px}code{background:var(--code);padding:.15em .35em;border-radius:3px}pre code{padding:0}blockquote{border-left:4px solid var(--border);margin-left:0;padding-left:16px}table{border-collapse:collapse;width:max-content;max-width:100%;margin:16px 0}th,td{border:1px solid var(--border);padding:6px 13px}th{background:var(--code)}.gmc-export-diagram{margin:24px 0;text-align:center}.gmc-export-diagram img{display:block;margin:auto}@media print{body{max-width:none;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>${body}</body></html>`;
    }
    async function renderMarkdownDocument(context, document) {
      const dark = vscode2.window.activeColorTheme.kind !== vscode2.ColorThemeKind.Light && vscode2.window.activeColorTheme.kind !== vscode2.ColorThemeKind.HighContrastLight;
      let renderer;
      try {
        if (/^(`{3,}|~{3,})\s*(?:gmc|graphmodel)\b/gmi.test(document.getText())) renderer = new GmcExportRenderer(context);
        const source = renderer ? await replaceGmcFences(document.getText(), renderer) : document.getText();
        const body = md.render(source).replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/gi, (match, before, value, after) => {
          if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(value)) return match;
          try {
            return before + new URL(value, pathToFileURL(document.fileName).href).href + after;
          } catch {
            return match;
          }
        });
        return documentHtml(path.basename(document.fileName), body, dark);
      } finally {
        renderer?.dispose();
      }
    }
    function commandExists(command) {
      try {
        cp.execFileSync(process.platform === "win32" ? "where.exe" : "which", [command], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    }
    function findBrowser() {
      const configured = vscode2.workspace.getConfiguration("markdownToolkit.export").get("browserPath", "");
      if (configured && fs.existsSync(configured)) return configured;
      const candidates = process.platform === "win32" ? [
        process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
        process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
      ] : process.platform === "darwin" ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Chromium.app/Contents/MacOS/Chromium"
      ] : ["/usr/bin/google-chrome", "/usr/bin/microsoft-edge", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
      const found = candidates.filter(Boolean).find(fs.existsSync);
      if (found) return found;
      return ["msedge", "google-chrome", "chromium", "chromium-browser"].find(commandExists);
    }
    function runBrowser(browser, args) {
      return new Promise((resolve, reject) => cp.execFile(browser, args, { timeout: 12e4, windowsHide: true }, (error, _stdout, stderr) => {
        if (error) reject(new Error(stderr || error.message));
        else resolve();
      }));
    }
    function findPandoc() {
      const configured = vscode2.workspace.getConfiguration("markdownToolkit.pandoc").get("path", "");
      if (configured && fs.existsSync(configured)) return configured;
      const candidates = process.platform === "win32" ? [
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Pandoc", "pandoc.exe"),
        process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Pandoc", "pandoc.exe")
      ] : ["/usr/local/bin/pandoc", "/usr/bin/pandoc", "/opt/homebrew/bin/pandoc"];
      return candidates.filter(Boolean).find(fs.existsSync) || (commandExists("pandoc") ? "pandoc" : void 0);
    }
    function runProcess(executable, args) {
      return new Promise((resolve, reject) => cp.execFile(executable, args, { timeout: 18e4, windowsHide: true }, (error, _stdout, stderr) => {
        if (error) reject(new Error(stderr || error.message));
        else resolve();
      }));
    }
    async function chooseReferenceDoc() {
      const configured = vscode2.workspace.getConfiguration("markdownToolkit.pandoc").get("referenceDoc", "");
      const choices = [];
      if (configured && fs.existsSync(configured)) choices.push({ label: "Use configured DOCX template", description: configured, value: configured });
      choices.push(
        { label: "No DOCX template", description: "Use Pandoc default styles", value: "" },
        { label: "Choose DOCX template...", description: "Select a reference .docx file", choose: true }
      );
      const choice = await vscode2.window.showQuickPick(choices, { placeHolder: "Choose a Pandoc DOCX template" });
      if (!choice) return void 0;
      if (!choice.choose) return choice.value;
      const selected = await vscode2.window.showOpenDialog({
        canSelectMany: false,
        filters: { "Word document template": ["docx"] },
        title: "Choose Pandoc reference DOCX"
      });
      return selected?.[0]?.fsPath;
    }
    async function chooseTarget(document, extension, label) {
      const basename = path.basename(document.fileName, path.extname(document.fileName));
      return vscode2.window.showSaveDialog({
        defaultUri: vscode2.Uri.joinPath(document.uri, "..", `${basename}.${extension}`),
        filters: { [label]: [extension] }
      });
    }
    var lastMarkdownUri;
    async function resolveMarkdownDocument() {
      const active = vscode2.window.activeTextEditor?.document;
      if (active?.languageId === "markdown") return active;
      if (lastMarkdownUri) {
        try {
          const remembered = await vscode2.workspace.openTextDocument(lastMarkdownUri);
          if (remembered.languageId === "markdown") return remembered;
        } catch {
        }
      }
      const visible = vscode2.window.visibleTextEditors.find((editor) => editor.document.languageId === "markdown")?.document;
      if (visible) return visible;
      return vscode2.workspace.textDocuments.find((document) => document.languageId === "markdown");
    }
    async function exportDocument(context, format) {
      const document = await resolveMarkdownDocument();
      if (!document || document.languageId !== "markdown") {
        return vscode2.window.showInformationMessage("Open a Markdown document before exporting its preview.");
      }
      const target = await chooseTarget(document, format, format.toUpperCase());
      if (!target) return;
      await vscode2.window.withProgress({ location: vscode2.ProgressLocation.Notification, title: `Exporting Markdown preview to ${format.toUpperCase()}\u2026` }, async () => {
        const html = await renderMarkdownDocument(context, document);
        if (format === "html") {
          await vscode2.workspace.fs.writeFile(target, Buffer.from(html, "utf8"));
          return;
        }
        const browser = findBrowser();
        if (!browser) throw new Error("No Chromium-based browser was found. Configure markdownToolkit.export.browserPath.");
        const temporaryHtml = path.join(os.tmpdir(), `gmc-markdown-export-${process.pid}-${Date.now()}.html`);
        fs.writeFileSync(temporaryHtml, html, "utf8");
        try {
          const common = ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files"];
          if (format === "pdf") {
            await runBrowser(browser, [...common, `--print-to-pdf=${target.fsPath}`, "--no-pdf-header-footer", pathToFileURL(temporaryHtml).href]);
          } else {
            const config = vscode2.workspace.getConfiguration("markdownToolkit.export");
            const width = Math.max(640, Math.min(4096, config.get("pngWidth", 1440)));
            const height = Math.max(480, Math.min(3e4, config.get("pngHeight", 1e4)));
            await runBrowser(browser, [...common, `--screenshot=${target.fsPath}`, `--window-size=${width},${height}`, pathToFileURL(temporaryHtml).href]);
          }
        } finally {
          try {
            fs.unlinkSync(temporaryHtml);
          } catch {
          }
        }
      });
      vscode2.window.showInformationMessage(`Exported ${path.basename(target.fsPath)}`);
    }
    async function exportDocx(context) {
      const document = await resolveMarkdownDocument();
      if (!document) return vscode2.window.showInformationMessage("Open a Markdown document before exporting it.");
      const pandoc = findPandoc();
      if (!pandoc) throw new Error("Pandoc was not found. Install Pandoc or configure markdownToolkit.pandoc.path.");
      const referenceDoc = await chooseReferenceDoc();
      if (referenceDoc === void 0) return;
      const target = await chooseTarget(document, "docx", "Word document");
      if (!target) return;
      await vscode2.window.withProgress({ location: vscode2.ProgressLocation.Notification, title: "Exporting Markdown to DOCX with Pandoc..." }, async () => {
        const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "gmc-pandoc-export-"));
        const input = path.join(temporaryDirectory, "document.md");
        let renderer;
        try {
          let source = document.getText();
          if (/^(`{3,}|~{3,})\s*(?:gmc|graphmodel)\b/gmi.test(source)) {
            renderer = new GmcExportRenderer(context);
            source = await replaceGmcFencesWithFiles(source, renderer, temporaryDirectory);
          }
          fs.writeFileSync(input, source, "utf8");
          const resourcePath = [path.dirname(document.fileName), temporaryDirectory].join(path.delimiter);
          const args = [input, `--output=${target.fsPath}`, "--from=gfm+raw_html", "--standalone", `--resource-path=${resourcePath}`];
          if (referenceDoc) args.push(`--reference-doc=${referenceDoc}`);
          await runProcess(pandoc, args);
        } finally {
          renderer?.dispose();
          try {
            fs.rmSync(temporaryDirectory, { recursive: true, force: true });
          } catch {
          }
        }
      });
      vscode2.window.showInformationMessage(`Exported ${path.basename(target.fsPath)}`);
    }
    async function showExportPicker(context) {
      const choice = await vscode2.window.showQuickPick([
        { label: "$(code) HTML", description: "Self-contained styled preview", format: "html" },
        { label: "$(file-pdf) PDF", description: "Rendered with Edge, Chrome, or Chromium", format: "pdf" },
        { label: "$(file-media) PNG", description: "Long preview image", format: "png" },
        { label: "$(file) DOCX (Pandoc)", description: "Choose an optional reference DOCX template", format: "docx" }
      ], { placeHolder: "Export Markdown preview" });
      if (!choice) return;
      return choice.format === "docx" ? exportDocx(context) : exportDocument(context, choice.format);
    }
    function registerExports2(context) {
      const remember = (editor) => {
        if (editor?.document.languageId === "markdown") lastMarkdownUri = editor.document.uri;
      };
      remember(vscode2.window.activeTextEditor);
      const guarded = (callback) => () => Promise.resolve(callback()).catch((error) => {
        vscode2.window.showErrorMessage(`Markdown export failed: ${error instanceof Error ? error.message : String(error)}`);
      });
      context.subscriptions.push(
        vscode2.window.onDidChangeActiveTextEditor(remember),
        vscode2.commands.registerCommand("markdownToolkit.export", guarded(() => showExportPicker(context))),
        vscode2.commands.registerCommand("markdownToolkit.exportHtml", guarded(() => exportDocument(context, "html"))),
        vscode2.commands.registerCommand("markdownToolkit.exportPdf", guarded(() => exportDocument(context, "pdf"))),
        vscode2.commands.registerCommand("markdownToolkit.exportPng", guarded(() => exportDocument(context, "png"))),
        vscode2.commands.registerCommand("markdownToolkit.exportDocx", guarded(() => exportDocx(context)))
      );
    }
    module2.exports = {
      GmcExportRenderer,
      documentHtml,
      exportDocx,
      findPandoc,
      registerExports: registerExports2,
      renderMarkdownDocument,
      replaceGmcFences,
      replaceGmcFencesWithFiles,
      showExportPicker
    };
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Event.js
var require_Event = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Event.js"(exports2, module2) {
    "use strict";
    module2.exports = Event;
    Event.CAPTURING_PHASE = 1;
    Event.AT_TARGET = 2;
    Event.BUBBLING_PHASE = 3;
    function Event(type, dictionary) {
      this.type = "";
      this.target = null;
      this.currentTarget = null;
      this.eventPhase = Event.AT_TARGET;
      this.bubbles = false;
      this.cancelable = false;
      this.isTrusted = false;
      this.defaultPrevented = false;
      this.timeStamp = Date.now();
      this._propagationStopped = false;
      this._immediatePropagationStopped = false;
      this._initialized = true;
      this._dispatching = false;
      if (type) this.type = type;
      if (dictionary) {
        for (var p in dictionary) {
          this[p] = dictionary[p];
        }
      }
    }
    Event.prototype = Object.create(Object.prototype, {
      constructor: { value: Event },
      stopPropagation: { value: function stopPropagation() {
        this._propagationStopped = true;
      } },
      stopImmediatePropagation: { value: function stopImmediatePropagation() {
        this._propagationStopped = true;
        this._immediatePropagationStopped = true;
      } },
      preventDefault: { value: function preventDefault() {
        if (this.cancelable) this.defaultPrevented = true;
      } },
      initEvent: { value: function initEvent(type, bubbles, cancelable) {
        this._initialized = true;
        if (this._dispatching) return;
        this._propagationStopped = false;
        this._immediatePropagationStopped = false;
        this.defaultPrevented = false;
        this.isTrusted = false;
        this.target = null;
        this.type = type;
        this.bubbles = bubbles;
        this.cancelable = cancelable;
      } }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/UIEvent.js
var require_UIEvent = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/UIEvent.js"(exports2, module2) {
    "use strict";
    var Event = require_Event();
    module2.exports = UIEvent;
    function UIEvent() {
      Event.call(this);
      this.view = null;
      this.detail = 0;
    }
    UIEvent.prototype = Object.create(Event.prototype, {
      constructor: { value: UIEvent },
      initUIEvent: { value: function(type, bubbles, cancelable, view, detail) {
        this.initEvent(type, bubbles, cancelable);
        this.view = view;
        this.detail = detail;
      } }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/MouseEvent.js
var require_MouseEvent = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/MouseEvent.js"(exports2, module2) {
    "use strict";
    var UIEvent = require_UIEvent();
    module2.exports = MouseEvent;
    function MouseEvent() {
      UIEvent.call(this);
      this.screenX = this.screenY = this.clientX = this.clientY = 0;
      this.ctrlKey = this.altKey = this.shiftKey = this.metaKey = false;
      this.button = 0;
      this.buttons = 1;
      this.relatedTarget = null;
    }
    MouseEvent.prototype = Object.create(UIEvent.prototype, {
      constructor: { value: MouseEvent },
      initMouseEvent: { value: function(type, bubbles, cancelable, view, detail, screenX, screenY, clientX, clientY, ctrlKey, altKey, shiftKey, metaKey, button, relatedTarget) {
        this.initEvent(type, bubbles, cancelable, view, detail);
        this.screenX = screenX;
        this.screenY = screenY;
        this.clientX = clientX;
        this.clientY = clientY;
        this.ctrlKey = ctrlKey;
        this.altKey = altKey;
        this.shiftKey = shiftKey;
        this.metaKey = metaKey;
        this.button = button;
        switch (button) {
          case 0:
            this.buttons = 1;
            break;
          case 1:
            this.buttons = 4;
            break;
          case 2:
            this.buttons = 2;
            break;
          default:
            this.buttons = 0;
            break;
        }
        this.relatedTarget = relatedTarget;
      } },
      getModifierState: { value: function(key) {
        switch (key) {
          case "Alt":
            return this.altKey;
          case "Control":
            return this.ctrlKey;
          case "Shift":
            return this.shiftKey;
          case "Meta":
            return this.metaKey;
          default:
            return false;
        }
      } }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/DOMException.js
var require_DOMException = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/DOMException.js"(exports2, module2) {
    "use strict";
    module2.exports = DOMException;
    var INDEX_SIZE_ERR = 1;
    var HIERARCHY_REQUEST_ERR = 3;
    var WRONG_DOCUMENT_ERR = 4;
    var INVALID_CHARACTER_ERR = 5;
    var NO_MODIFICATION_ALLOWED_ERR = 7;
    var NOT_FOUND_ERR = 8;
    var NOT_SUPPORTED_ERR = 9;
    var INVALID_STATE_ERR = 11;
    var SYNTAX_ERR = 12;
    var INVALID_MODIFICATION_ERR = 13;
    var NAMESPACE_ERR = 14;
    var INVALID_ACCESS_ERR = 15;
    var TYPE_MISMATCH_ERR = 17;
    var SECURITY_ERR = 18;
    var NETWORK_ERR = 19;
    var ABORT_ERR = 20;
    var URL_MISMATCH_ERR = 21;
    var QUOTA_EXCEEDED_ERR = 22;
    var TIMEOUT_ERR = 23;
    var INVALID_NODE_TYPE_ERR = 24;
    var DATA_CLONE_ERR = 25;
    var names = [
      null,
      // No error with code 0
      "INDEX_SIZE_ERR",
      null,
      // historical
      "HIERARCHY_REQUEST_ERR",
      "WRONG_DOCUMENT_ERR",
      "INVALID_CHARACTER_ERR",
      null,
      // historical
      "NO_MODIFICATION_ALLOWED_ERR",
      "NOT_FOUND_ERR",
      "NOT_SUPPORTED_ERR",
      "INUSE_ATTRIBUTE_ERR",
      // historical
      "INVALID_STATE_ERR",
      "SYNTAX_ERR",
      "INVALID_MODIFICATION_ERR",
      "NAMESPACE_ERR",
      "INVALID_ACCESS_ERR",
      null,
      // historical
      "TYPE_MISMATCH_ERR",
      "SECURITY_ERR",
      "NETWORK_ERR",
      "ABORT_ERR",
      "URL_MISMATCH_ERR",
      "QUOTA_EXCEEDED_ERR",
      "TIMEOUT_ERR",
      "INVALID_NODE_TYPE_ERR",
      "DATA_CLONE_ERR"
    ];
    var messages = [
      null,
      // No error with code 0
      "INDEX_SIZE_ERR (1): the index is not in the allowed range",
      null,
      "HIERARCHY_REQUEST_ERR (3): the operation would yield an incorrect nodes model",
      "WRONG_DOCUMENT_ERR (4): the object is in the wrong Document, a call to importNode is required",
      "INVALID_CHARACTER_ERR (5): the string contains invalid characters",
      null,
      "NO_MODIFICATION_ALLOWED_ERR (7): the object can not be modified",
      "NOT_FOUND_ERR (8): the object can not be found here",
      "NOT_SUPPORTED_ERR (9): this operation is not supported",
      "INUSE_ATTRIBUTE_ERR (10): setAttributeNode called on owned Attribute",
      "INVALID_STATE_ERR (11): the object is in an invalid state",
      "SYNTAX_ERR (12): the string did not match the expected pattern",
      "INVALID_MODIFICATION_ERR (13): the object can not be modified in this way",
      "NAMESPACE_ERR (14): the operation is not allowed by Namespaces in XML",
      "INVALID_ACCESS_ERR (15): the object does not support the operation or argument",
      null,
      "TYPE_MISMATCH_ERR (17): the type of the object does not match the expected type",
      "SECURITY_ERR (18): the operation is insecure",
      "NETWORK_ERR (19): a network error occurred",
      "ABORT_ERR (20): the user aborted an operation",
      "URL_MISMATCH_ERR (21): the given URL does not match another URL",
      "QUOTA_EXCEEDED_ERR (22): the quota has been exceeded",
      "TIMEOUT_ERR (23): a timeout occurred",
      "INVALID_NODE_TYPE_ERR (24): the supplied node is invalid or has an invalid ancestor for this operation",
      "DATA_CLONE_ERR (25): the object can not be cloned."
    ];
    var constants = {
      INDEX_SIZE_ERR,
      DOMSTRING_SIZE_ERR: 2,
      // historical
      HIERARCHY_REQUEST_ERR,
      WRONG_DOCUMENT_ERR,
      INVALID_CHARACTER_ERR,
      NO_DATA_ALLOWED_ERR: 6,
      // historical
      NO_MODIFICATION_ALLOWED_ERR,
      NOT_FOUND_ERR,
      NOT_SUPPORTED_ERR,
      INUSE_ATTRIBUTE_ERR: 10,
      // historical
      INVALID_STATE_ERR,
      SYNTAX_ERR,
      INVALID_MODIFICATION_ERR,
      NAMESPACE_ERR,
      INVALID_ACCESS_ERR,
      VALIDATION_ERR: 16,
      // historical
      TYPE_MISMATCH_ERR,
      SECURITY_ERR,
      NETWORK_ERR,
      ABORT_ERR,
      URL_MISMATCH_ERR,
      QUOTA_EXCEEDED_ERR,
      TIMEOUT_ERR,
      INVALID_NODE_TYPE_ERR,
      DATA_CLONE_ERR
    };
    function DOMException(code) {
      Error.call(this);
      Error.captureStackTrace(this, this.constructor);
      this.code = code;
      this.message = messages[code];
      this.name = names[code];
    }
    DOMException.prototype.__proto__ = Error.prototype;
    for (c in constants) {
      v = { value: constants[c] };
      Object.defineProperty(DOMException, c, v);
      Object.defineProperty(DOMException.prototype, c, v);
    }
    var v;
    var c;
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/config.js
var require_config = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/config.js"(exports2) {
    exports2.isApiWritable = !globalThis.__domino_frozen__;
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/utils.js
var require_utils = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/utils.js"(exports2) {
    "use strict";
    var DOMException = require_DOMException();
    var ERR = DOMException;
    var isApiWritable = require_config().isApiWritable;
    exports2.NAMESPACE = {
      HTML: "http://www.w3.org/1999/xhtml",
      XML: "http://www.w3.org/XML/1998/namespace",
      XMLNS: "http://www.w3.org/2000/xmlns/",
      MATHML: "http://www.w3.org/1998/Math/MathML",
      SVG: "http://www.w3.org/2000/svg",
      XLINK: "http://www.w3.org/1999/xlink"
    };
    exports2.IndexSizeError = function() {
      throw new DOMException(ERR.INDEX_SIZE_ERR);
    };
    exports2.HierarchyRequestError = function() {
      throw new DOMException(ERR.HIERARCHY_REQUEST_ERR);
    };
    exports2.WrongDocumentError = function() {
      throw new DOMException(ERR.WRONG_DOCUMENT_ERR);
    };
    exports2.InvalidCharacterError = function() {
      throw new DOMException(ERR.INVALID_CHARACTER_ERR);
    };
    exports2.NoModificationAllowedError = function() {
      throw new DOMException(ERR.NO_MODIFICATION_ALLOWED_ERR);
    };
    exports2.NotFoundError = function() {
      throw new DOMException(ERR.NOT_FOUND_ERR);
    };
    exports2.NotSupportedError = function() {
      throw new DOMException(ERR.NOT_SUPPORTED_ERR);
    };
    exports2.InvalidStateError = function() {
      throw new DOMException(ERR.INVALID_STATE_ERR);
    };
    exports2.SyntaxError = function() {
      throw new DOMException(ERR.SYNTAX_ERR);
    };
    exports2.InvalidModificationError = function() {
      throw new DOMException(ERR.INVALID_MODIFICATION_ERR);
    };
    exports2.NamespaceError = function() {
      throw new DOMException(ERR.NAMESPACE_ERR);
    };
    exports2.InvalidAccessError = function() {
      throw new DOMException(ERR.INVALID_ACCESS_ERR);
    };
    exports2.TypeMismatchError = function() {
      throw new DOMException(ERR.TYPE_MISMATCH_ERR);
    };
    exports2.SecurityError = function() {
      throw new DOMException(ERR.SECURITY_ERR);
    };
    exports2.NetworkError = function() {
      throw new DOMException(ERR.NETWORK_ERR);
    };
    exports2.AbortError = function() {
      throw new DOMException(ERR.ABORT_ERR);
    };
    exports2.UrlMismatchError = function() {
      throw new DOMException(ERR.URL_MISMATCH_ERR);
    };
    exports2.QuotaExceededError = function() {
      throw new DOMException(ERR.QUOTA_EXCEEDED_ERR);
    };
    exports2.TimeoutError = function() {
      throw new DOMException(ERR.TIMEOUT_ERR);
    };
    exports2.InvalidNodeTypeError = function() {
      throw new DOMException(ERR.INVALID_NODE_TYPE_ERR);
    };
    exports2.DataCloneError = function() {
      throw new DOMException(ERR.DATA_CLONE_ERR);
    };
    exports2.nyi = function() {
      throw new Error("NotYetImplemented");
    };
    exports2.shouldOverride = function() {
      throw new Error("Abstract function; should be overriding in subclass.");
    };
    exports2.assert = function(expr, msg) {
      if (!expr) {
        throw new Error("Assertion failed: " + (msg || "") + "\n" + new Error().stack);
      }
    };
    exports2.expose = function(src, c) {
      for (var n in src) {
        Object.defineProperty(c.prototype, n, { value: src[n], writable: isApiWritable });
      }
    };
    exports2.merge = function(a, b) {
      for (var n in b) {
        a[n] = b[n];
      }
    };
    exports2.documentOrder = function(n, m) {
      return 3 - (n.compareDocumentPosition(m) & 6);
    };
    exports2.toASCIILowerCase = function(s) {
      return s.replace(/[A-Z]+/g, function(c) {
        return c.toLowerCase();
      });
    };
    exports2.toASCIIUpperCase = function(s) {
      return s.replace(/[a-z]+/g, function(c) {
        return c.toUpperCase();
      });
    };
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/EventTarget.js
var require_EventTarget = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/EventTarget.js"(exports2, module2) {
    "use strict";
    var Event = require_Event();
    var MouseEvent = require_MouseEvent();
    var utils = require_utils();
    module2.exports = EventTarget;
    function EventTarget() {
    }
    EventTarget.prototype = {
      // XXX
      // See WebIDL §4.8 for details on object event handlers
      // and how they should behave.  We actually have to accept
      // any object to addEventListener... Can't type check it.
      // on registration.
      // XXX:
      // Capturing event listeners are sort of rare.  I think I can optimize
      // them so that dispatchEvent can skip the capturing phase (or much of
      // it).  Each time a capturing listener is added, increment a flag on
      // the target node and each of its ancestors.  Decrement when removed.
      // And update the counter when nodes are added and removed from the
      // tree as well.  Then, in dispatch event, the capturing phase can
      // abort if it sees any node with a zero count.
      addEventListener: function addEventListener(type, listener, capture) {
        if (!listener) return;
        if (capture === void 0) capture = false;
        if (!this._listeners) this._listeners = /* @__PURE__ */ Object.create(null);
        if (!this._listeners[type]) this._listeners[type] = [];
        var list = this._listeners[type];
        for (var i = 0, n = list.length; i < n; i++) {
          var l = list[i];
          if (l.listener === listener && l.capture === capture)
            return;
        }
        var obj = { listener, capture };
        if (typeof listener === "function") obj.f = listener;
        list.push(obj);
      },
      removeEventListener: function removeEventListener(type, listener, capture) {
        if (capture === void 0) capture = false;
        if (this._listeners) {
          var list = this._listeners[type];
          if (list) {
            for (var i = 0, n = list.length; i < n; i++) {
              var l = list[i];
              if (l.listener === listener && l.capture === capture) {
                if (list.length === 1) {
                  this._listeners[type] = void 0;
                } else {
                  list.splice(i, 1);
                }
                return;
              }
            }
          }
        }
      },
      // This is the public API for dispatching untrusted public events.
      // See _dispatchEvent for the implementation
      dispatchEvent: function dispatchEvent(event) {
        return this._dispatchEvent(event, false);
      },
      //
      // See DOMCore §4.4
      // XXX: I'll probably need another version of this method for
      // internal use, one that does not set isTrusted to false.
      // XXX: see Document._dispatchEvent: perhaps that and this could
      // call a common internal function with different settings of
      // a trusted boolean argument
      //
      // XXX:
      // The spec has changed in how to deal with handlers registered
      // on idl or content attributes rather than with addEventListener.
      // Used to say that they always ran first.  That's how webkit does it
      // Spec now says that they run in a position determined by
      // when they were first set.  FF does it that way.  See:
      // http://www.whatwg.org/specs/web-apps/current-work/multipage/webappapis.html#event-handlers
      //
      _dispatchEvent: function _dispatchEvent(event, trusted) {
        if (typeof trusted !== "boolean") trusted = false;
        function invoke(target, event2) {
          var type = event2.type, phase = event2.eventPhase;
          event2.currentTarget = target;
          if (phase !== Event.CAPTURING_PHASE && target._handlers && target._handlers[type]) {
            var handler = target._handlers[type];
            var rv;
            if (typeof handler === "function") {
              rv = handler.call(event2.currentTarget, event2);
            } else {
              var f = handler.handleEvent;
              if (typeof f !== "function")
                throw new TypeError("handleEvent property of event handler object isnot a function.");
              rv = f.call(handler, event2);
            }
            switch (event2.type) {
              case "mouseover":
                if (rv === true)
                  event2.preventDefault();
                break;
              case "beforeunload":
              // XXX: eventually we need a special case here
              /* falls through */
              default:
                if (rv === false)
                  event2.preventDefault();
                break;
            }
          }
          var list = target._listeners && target._listeners[type];
          if (!list) return;
          list = list.slice();
          for (var i2 = 0, n2 = list.length; i2 < n2; i2++) {
            if (event2._immediatePropagationStopped) return;
            var l = list[i2];
            if (phase === Event.CAPTURING_PHASE && !l.capture || phase === Event.BUBBLING_PHASE && l.capture)
              continue;
            if (l.f) {
              l.f.call(event2.currentTarget, event2);
            } else {
              var fn = l.listener.handleEvent;
              if (typeof fn !== "function")
                throw new TypeError("handleEvent property of event listener object is not a function.");
              fn.call(l.listener, event2);
            }
          }
        }
        if (!event._initialized || event._dispatching) utils.InvalidStateError();
        event.isTrusted = trusted;
        event._dispatching = true;
        event.target = this;
        var ancestors = [];
        for (var n = this.parentNode; n; n = n.parentNode)
          ancestors.push(n);
        event.eventPhase = Event.CAPTURING_PHASE;
        for (var i = ancestors.length - 1; i >= 0; i--) {
          invoke(ancestors[i], event);
          if (event._propagationStopped) break;
        }
        if (!event._propagationStopped) {
          event.eventPhase = Event.AT_TARGET;
          invoke(this, event);
        }
        if (event.bubbles && !event._propagationStopped) {
          event.eventPhase = Event.BUBBLING_PHASE;
          for (var ii = 0, nn = ancestors.length; ii < nn; ii++) {
            invoke(ancestors[ii], event);
            if (event._propagationStopped) break;
          }
        }
        event._dispatching = false;
        event.eventPhase = Event.AT_TARGET;
        event.currentTarget = null;
        if (trusted && !event.defaultPrevented && event instanceof MouseEvent) {
          switch (event.type) {
            case "mousedown":
              this._armed = {
                x: event.clientX,
                y: event.clientY,
                t: event.timeStamp
              };
              break;
            case "mouseout":
            case "mouseover":
              this._armed = null;
              break;
            case "mouseup":
              if (this._isClick(event)) this._doClick(event);
              this._armed = null;
              break;
          }
        }
        return !event.defaultPrevented;
      },
      // Determine whether a click occurred
      // XXX We don't support double clicks for now
      _isClick: function(event) {
        return this._armed !== null && event.type === "mouseup" && event.isTrusted && event.button === 0 && event.timeStamp - this._armed.t < 1e3 && Math.abs(event.clientX - this._armed.x) < 10 && Math.abs(event.clientY - this._armed.Y) < 10;
      },
      // Clicks are handled like this:
      // http://www.whatwg.org/specs/web-apps/current-work/multipage/elements.html#interactive-content-0
      //
      // Note that this method is similar to the HTMLElement.click() method
      // The event argument must be the trusted mouseup event
      _doClick: function(event) {
        if (this._click_in_progress) return;
        this._click_in_progress = true;
        var activated = this;
        while (activated && !activated._post_click_activation_steps)
          activated = activated.parentNode;
        if (activated && activated._pre_click_activation_steps) {
          activated._pre_click_activation_steps();
        }
        var click = this.ownerDocument.createEvent("MouseEvent");
        click.initMouseEvent(
          "click",
          true,
          true,
          this.ownerDocument.defaultView,
          1,
          event.screenX,
          event.screenY,
          event.clientX,
          event.clientY,
          event.ctrlKey,
          event.altKey,
          event.shiftKey,
          event.metaKey,
          event.button,
          null
        );
        var result = this._dispatchEvent(click, true);
        if (activated) {
          if (result) {
            if (activated._post_click_activation_steps)
              activated._post_click_activation_steps(click);
          } else {
            if (activated._cancelled_activation_steps)
              activated._cancelled_activation_steps();
          }
        }
      },
      //
      // An event handler is like an event listener, but it registered
      // by setting an IDL or content attribute like onload or onclick.
      // There can only be one of these at a time for any event type.
      // This is an internal method for the attribute accessors and
      // content attribute handlers that need to register events handlers.
      // The type argument is the same as in addEventListener().
      // The handler argument is the same as listeners in addEventListener:
      // it can be a function or an object. Pass null to remove any existing
      // handler.  Handlers are always invoked before any listeners of
      // the same type.  They are not invoked during the capturing phase
      // of event dispatch.
      //
      _setEventHandler: function _setEventHandler(type, handler) {
        if (!this._handlers) this._handlers = /* @__PURE__ */ Object.create(null);
        this._handlers[type] = handler;
      },
      _getEventHandler: function _getEventHandler(type) {
        return this._handlers && this._handlers[type] || null;
      }
    };
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/LinkedList.js
var require_LinkedList = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/LinkedList.js"(exports2, module2) {
    "use strict";
    var utils = require_utils();
    var LinkedList = module2.exports = {
      // basic validity tests on a circular linked list a
      valid: function(a) {
        utils.assert(a, "list falsy");
        utils.assert(a._previousSibling, "previous falsy");
        utils.assert(a._nextSibling, "next falsy");
        return true;
      },
      // insert a before b
      insertBefore: function(a, b) {
        utils.assert(LinkedList.valid(a) && LinkedList.valid(b));
        var a_first = a, a_last = a._previousSibling;
        var b_first = b, b_last = b._previousSibling;
        a_first._previousSibling = b_last;
        a_last._nextSibling = b_first;
        b_last._nextSibling = a_first;
        b_first._previousSibling = a_last;
        utils.assert(LinkedList.valid(a) && LinkedList.valid(b));
      },
      // replace a single node a with a list b (which could be null)
      replace: function(a, b) {
        utils.assert(LinkedList.valid(a) && (b === null || LinkedList.valid(b)));
        if (b !== null) {
          LinkedList.insertBefore(b, a);
        }
        LinkedList.remove(a);
        utils.assert(LinkedList.valid(a) && (b === null || LinkedList.valid(b)));
      },
      // remove single node a from its list
      remove: function(a) {
        utils.assert(LinkedList.valid(a));
        var prev = a._previousSibling;
        if (prev === a) {
          return;
        }
        var next = a._nextSibling;
        prev._nextSibling = next;
        next._previousSibling = prev;
        a._previousSibling = a._nextSibling = a;
        utils.assert(LinkedList.valid(a));
      }
    };
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NodeUtils.js
var require_NodeUtils = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NodeUtils.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      // NOTE: The `serializeOne()` function used to live on the `Node.prototype`
      // as a private method `Node#_serializeOne(child)`, however that requires
      // a megamorphic property access `this._serializeOne` just to get to the
      // method, and this is being done on lots of different `Node` subclasses,
      // which puts a lot of pressure on V8's megamorphic stub cache. So by
      // moving the helper off of the `Node.prototype` and into a separate
      // function in this helper module, we get a monomorphic property access
      // `NodeUtils.serializeOne` to get to the function and reduce pressure
      // on the megamorphic stub cache.
      // See https://github.com/fgnass/domino/pull/142 for more information.
      serializeOne,
      // Export util functions so that we can run extra test for them.
      // Note: we prefix function names with `ɵ`, similar to what we do
      // with internal functions in Angular packages.
      \u0275escapeMatchingClosingTag: escapeMatchingClosingTag,
      \u0275escapeClosingCommentTag: escapeClosingCommentTag,
      \u0275escapeProcessingInstructionContent: escapeProcessingInstructionContent
    };
    var utils = require_utils();
    var NAMESPACE = utils.NAMESPACE;
    var hasRawContent = {
      STYLE: true,
      SCRIPT: true,
      XMP: true,
      IFRAME: true,
      NOEMBED: true,
      NOFRAMES: true,
      PLAINTEXT: true
    };
    var emptyElements = {
      area: true,
      base: true,
      basefont: true,
      bgsound: true,
      br: true,
      col: true,
      embed: true,
      frame: true,
      hr: true,
      img: true,
      input: true,
      keygen: true,
      link: true,
      meta: true,
      param: true,
      source: true,
      track: true,
      wbr: true
    };
    var extraNewLine = {
      /* Removed in https://github.com/whatwg/html/issues/944
      pre: true,
      textarea: true,
      listing: true
      */
    };
    var ESCAPE_REGEXP = /[&<>\u00A0]/g;
    var ESCAPE_ATTR_REGEXP = /[&"<>\u00A0]/g;
    function escape(s) {
      if (!ESCAPE_REGEXP.test(s)) {
        return s;
      }
      return s.replace(ESCAPE_REGEXP, (c) => {
        switch (c) {
          case "&":
            return "&amp;";
          case "<":
            return "&lt;";
          case ">":
            return "&gt;";
          case "\xA0":
            return "&nbsp;";
        }
      });
    }
    function escapeAttr(s) {
      if (!ESCAPE_ATTR_REGEXP.test(s)) {
        return s;
      }
      return s.replace(ESCAPE_ATTR_REGEXP, (c) => {
        switch (c) {
          case "<":
            return "&lt;";
          case ">":
            return "&gt;";
          case "&":
            return "&amp;";
          case '"':
            return "&quot;";
          case "\xA0":
            return "&nbsp;";
        }
      });
    }
    function attrname(a) {
      var ns = a.namespaceURI;
      if (!ns)
        return a.localName;
      if (ns === NAMESPACE.XML)
        return "xml:" + a.localName;
      if (ns === NAMESPACE.XLINK)
        return "xlink:" + a.localName;
      if (ns === NAMESPACE.XMLNS) {
        if (a.localName === "xmlns") return "xmlns";
        else return "xmlns:" + a.localName;
      }
      return a.name;
    }
    function escapeMatchingClosingTag(rawText, parentTag) {
      const parentClosingTag = "</" + parentTag;
      if (!rawText.toLowerCase().includes(parentClosingTag)) {
        return rawText;
      }
      const result = [...rawText];
      const matches = rawText.matchAll(new RegExp(parentClosingTag, "ig"));
      for (const match of matches) {
        result[match.index] = "&lt;";
      }
      return result.join("");
    }
    var CLOSING_COMMENT_REGEXP = /--!?>/;
    function escapeClosingCommentTag(rawContent) {
      if (!CLOSING_COMMENT_REGEXP.test(rawContent)) {
        return rawContent;
      }
      return rawContent.replace(/(--\!?)>/g, "$1&gt;");
    }
    function escapeProcessingInstructionContent(rawContent) {
      return rawContent.includes(">") ? rawContent.replaceAll(">", "&gt;") : rawContent;
    }
    function serializeOne(kid, parent) {
      var s = "";
      switch (kid.nodeType) {
        case 1:
          var ns = kid.namespaceURI;
          var html = ns === NAMESPACE.HTML;
          var tagname = html || ns === NAMESPACE.SVG || ns === NAMESPACE.MATHML ? kid.localName : kid.tagName;
          s += "<" + tagname;
          for (var j = 0, k = kid._numattrs; j < k; j++) {
            var a = kid._attr(j);
            s += " " + attrname(a);
            if (a.value !== void 0) s += '="' + escapeAttr(a.value) + '"';
          }
          s += ">";
          if (!(html && emptyElements[tagname])) {
            var ss = kid.serialize();
            if (hasRawContent[tagname.toUpperCase()]) {
              ss = escapeMatchingClosingTag(ss, tagname);
            }
            if (html && extraNewLine[tagname] && ss.charAt(0) === "\n") s += "\n";
            s += ss;
            s += "</" + tagname + ">";
          }
          break;
        case 3:
        //TEXT_NODE
        case 4:
          var parenttag;
          if (parent.nodeType === 1 && parent.namespaceURI === NAMESPACE.HTML)
            parenttag = parent.tagName;
          else
            parenttag = "";
          if (hasRawContent[parenttag] || parenttag === "NOSCRIPT" && parent.ownerDocument._scripting_enabled) {
            s += kid.data;
          } else {
            s += escape(kid.data);
          }
          break;
        case 8:
          s += "<!--" + escapeClosingCommentTag(kid.data) + "-->";
          break;
        case 7:
          const content = escapeProcessingInstructionContent(kid.data);
          s += "<?" + kid.target + " " + content + "?>";
          break;
        case 10:
          s += "<!DOCTYPE " + kid.name;
          if (false) {
            if (kid.publicID) {
              s += ' PUBLIC "' + kid.publicId + '"';
            }
            if (kid.systemId) {
              s += ' "' + kid.systemId + '"';
            }
          }
          s += ">";
          break;
        default:
          utils.InvalidStateError();
      }
      return s;
    }
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Node.js
var require_Node = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Node.js"(exports2, module2) {
    "use strict";
    module2.exports = Node;
    var EventTarget = require_EventTarget();
    var LinkedList = require_LinkedList();
    var NodeUtils = require_NodeUtils();
    var utils = require_utils();
    function Node() {
      EventTarget.call(this);
      this.parentNode = null;
      this._nextSibling = this._previousSibling = this;
      this._index = void 0;
    }
    var ELEMENT_NODE = Node.ELEMENT_NODE = 1;
    var ATTRIBUTE_NODE = Node.ATTRIBUTE_NODE = 2;
    var TEXT_NODE = Node.TEXT_NODE = 3;
    var CDATA_SECTION_NODE = Node.CDATA_SECTION_NODE = 4;
    var ENTITY_REFERENCE_NODE = Node.ENTITY_REFERENCE_NODE = 5;
    var ENTITY_NODE = Node.ENTITY_NODE = 6;
    var PROCESSING_INSTRUCTION_NODE = Node.PROCESSING_INSTRUCTION_NODE = 7;
    var COMMENT_NODE = Node.COMMENT_NODE = 8;
    var DOCUMENT_NODE = Node.DOCUMENT_NODE = 9;
    var DOCUMENT_TYPE_NODE = Node.DOCUMENT_TYPE_NODE = 10;
    var DOCUMENT_FRAGMENT_NODE = Node.DOCUMENT_FRAGMENT_NODE = 11;
    var NOTATION_NODE = Node.NOTATION_NODE = 12;
    var DOCUMENT_POSITION_DISCONNECTED = Node.DOCUMENT_POSITION_DISCONNECTED = 1;
    var DOCUMENT_POSITION_PRECEDING = Node.DOCUMENT_POSITION_PRECEDING = 2;
    var DOCUMENT_POSITION_FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING = 4;
    var DOCUMENT_POSITION_CONTAINS = Node.DOCUMENT_POSITION_CONTAINS = 8;
    var DOCUMENT_POSITION_CONTAINED_BY = Node.DOCUMENT_POSITION_CONTAINED_BY = 16;
    var DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC = Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC = 32;
    Node.prototype = Object.create(EventTarget.prototype, {
      // Node that are not inserted into the tree inherit a null parent
      // XXX: the baseURI attribute is defined by dom core, but
      // a correct implementation of it requires HTML features, so
      // we'll come back to this later.
      baseURI: { get: utils.nyi },
      parentElement: { get: function() {
        return this.parentNode && this.parentNode.nodeType === ELEMENT_NODE ? this.parentNode : null;
      } },
      hasChildNodes: { value: utils.shouldOverride },
      firstChild: { get: utils.shouldOverride },
      lastChild: { get: utils.shouldOverride },
      isConnected: {
        get: function() {
          let node = this;
          while (node != null) {
            if (node.nodeType === Node.DOCUMENT_NODE) {
              return true;
            }
            node = node.parentNode;
            if (node != null && node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
              node = node.host;
            }
          }
          return false;
        }
      },
      previousSibling: { get: function() {
        var parent = this.parentNode;
        if (!parent) return null;
        if (this === parent.firstChild) return null;
        return this._previousSibling;
      } },
      nextSibling: { get: function() {
        var parent = this.parentNode, next = this._nextSibling;
        if (!parent) return null;
        if (next === parent.firstChild) return null;
        return next;
      } },
      textContent: {
        // Should override for DocumentFragment/Element/Attr/Text/PI/Comment
        get: function() {
          return null;
        },
        set: function(v) {
        }
      },
      innerText: {
        // Should override for DocumentFragment/Element/Attr/Text/PI/Comment
        get: function() {
          return null;
        },
        set: function(v) {
        }
      },
      _countChildrenOfType: { value: function(type) {
        var sum = 0;
        for (var kid = this.firstChild; kid !== null; kid = kid.nextSibling) {
          if (kid.nodeType === type) sum++;
        }
        return sum;
      } },
      _ensureInsertValid: { value: function _ensureInsertValid(node, child, isPreinsert) {
        var parent = this, i, kid;
        if (!node.nodeType) throw new TypeError("not a node");
        switch (parent.nodeType) {
          case DOCUMENT_NODE:
          case DOCUMENT_FRAGMENT_NODE:
          case ELEMENT_NODE:
            break;
          default:
            utils.HierarchyRequestError();
        }
        if (node.isAncestor(parent)) utils.HierarchyRequestError();
        if (child !== null || !isPreinsert) {
          if (child.parentNode !== parent) utils.NotFoundError();
        }
        switch (node.nodeType) {
          case DOCUMENT_FRAGMENT_NODE:
          case DOCUMENT_TYPE_NODE:
          case ELEMENT_NODE:
          case TEXT_NODE:
          case PROCESSING_INSTRUCTION_NODE:
          case COMMENT_NODE:
            break;
          default:
            utils.HierarchyRequestError();
        }
        if (parent.nodeType === DOCUMENT_NODE) {
          switch (node.nodeType) {
            case TEXT_NODE:
              utils.HierarchyRequestError();
              break;
            case DOCUMENT_FRAGMENT_NODE:
              if (node._countChildrenOfType(TEXT_NODE) > 0)
                utils.HierarchyRequestError();
              switch (node._countChildrenOfType(ELEMENT_NODE)) {
                case 0:
                  break;
                case 1:
                  if (child !== null) {
                    if (isPreinsert && child.nodeType === DOCUMENT_TYPE_NODE)
                      utils.HierarchyRequestError();
                    for (kid = child.nextSibling; kid !== null; kid = kid.nextSibling) {
                      if (kid.nodeType === DOCUMENT_TYPE_NODE)
                        utils.HierarchyRequestError();
                    }
                  }
                  i = parent._countChildrenOfType(ELEMENT_NODE);
                  if (isPreinsert) {
                    if (i > 0)
                      utils.HierarchyRequestError();
                  } else {
                    if (i > 1 || i === 1 && child.nodeType !== ELEMENT_NODE)
                      utils.HierarchyRequestError();
                  }
                  break;
                default:
                  utils.HierarchyRequestError();
              }
              break;
            case ELEMENT_NODE:
              if (child !== null) {
                if (isPreinsert && child.nodeType === DOCUMENT_TYPE_NODE)
                  utils.HierarchyRequestError();
                for (kid = child.nextSibling; kid !== null; kid = kid.nextSibling) {
                  if (kid.nodeType === DOCUMENT_TYPE_NODE)
                    utils.HierarchyRequestError();
                }
              }
              i = parent._countChildrenOfType(ELEMENT_NODE);
              if (isPreinsert) {
                if (i > 0)
                  utils.HierarchyRequestError();
              } else {
                if (i > 1 || i === 1 && child.nodeType !== ELEMENT_NODE)
                  utils.HierarchyRequestError();
              }
              break;
            case DOCUMENT_TYPE_NODE:
              if (child === null) {
                if (parent._countChildrenOfType(ELEMENT_NODE))
                  utils.HierarchyRequestError();
              } else {
                for (kid = parent.firstChild; kid !== null; kid = kid.nextSibling) {
                  if (kid === child) break;
                  if (kid.nodeType === ELEMENT_NODE)
                    utils.HierarchyRequestError();
                }
              }
              i = parent._countChildrenOfType(DOCUMENT_TYPE_NODE);
              if (isPreinsert) {
                if (i > 0)
                  utils.HierarchyRequestError();
              } else {
                if (i > 1 || i === 1 && child.nodeType !== DOCUMENT_TYPE_NODE)
                  utils.HierarchyRequestError();
              }
              break;
          }
        } else {
          if (node.nodeType === DOCUMENT_TYPE_NODE) utils.HierarchyRequestError();
        }
      } },
      insertBefore: { value: function insertBefore(node, child) {
        var parent = this;
        parent._ensureInsertValid(node, child, true);
        var refChild = child;
        if (refChild === node) {
          refChild = node.nextSibling;
        }
        parent.doc.adoptNode(node);
        node._insertOrReplace(parent, refChild, false);
        return node;
      } },
      appendChild: { value: function(child) {
        return this.insertBefore(child, null);
      } },
      _appendChild: { value: function(child) {
        child._insertOrReplace(this, null, false);
      } },
      removeChild: { value: function removeChild(child) {
        var parent = this;
        if (!child.nodeType) throw new TypeError("not a node");
        if (child.parentNode !== parent) utils.NotFoundError();
        child.remove();
        return child;
      } },
      // To replace a `child` with `node` within a `parent` (this)
      replaceChild: { value: function replaceChild(node, child) {
        var parent = this;
        parent._ensureInsertValid(node, child, false);
        if (node.doc !== parent.doc) {
          parent.doc.adoptNode(node);
        }
        node._insertOrReplace(parent, child, true);
        return child;
      } },
      // See: http://ejohn.org/blog/comparing-document-position/
      contains: { value: function contains(node) {
        if (node === null) {
          return false;
        }
        if (this === node) {
          return true;
        }
        return (this.compareDocumentPosition(node) & DOCUMENT_POSITION_CONTAINED_BY) !== 0;
      } },
      compareDocumentPosition: { value: function compareDocumentPosition(that) {
        if (this === that) return 0;
        if (this.doc !== that.doc || this.rooted !== that.rooted)
          return DOCUMENT_POSITION_DISCONNECTED + DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
        var these = [], those = [];
        for (var n = this; n !== null; n = n.parentNode) these.push(n);
        for (n = that; n !== null; n = n.parentNode) those.push(n);
        these.reverse();
        those.reverse();
        if (these[0] !== those[0])
          return DOCUMENT_POSITION_DISCONNECTED + DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
        n = Math.min(these.length, those.length);
        for (var i = 1; i < n; i++) {
          if (these[i] !== those[i]) {
            if (these[i].index < those[i].index)
              return DOCUMENT_POSITION_FOLLOWING;
            else
              return DOCUMENT_POSITION_PRECEDING;
          }
        }
        if (these.length < those.length)
          return DOCUMENT_POSITION_FOLLOWING + DOCUMENT_POSITION_CONTAINED_BY;
        else
          return DOCUMENT_POSITION_PRECEDING + DOCUMENT_POSITION_CONTAINS;
      } },
      isSameNode: { value: function isSameNode(node) {
        return this === node;
      } },
      // This method implements the generic parts of node equality testing
      // and defers to the (non-recursive) type-specific isEqual() method
      // defined by subclasses
      isEqualNode: { value: function isEqualNode(node) {
        if (!node) return false;
        if (node.nodeType !== this.nodeType) return false;
        if (!this.isEqual(node)) return false;
        for (var c1 = this.firstChild, c2 = node.firstChild; c1 && c2; c1 = c1.nextSibling, c2 = c2.nextSibling) {
          if (!c1.isEqualNode(c2)) return false;
        }
        return c1 === null && c2 === null;
      } },
      // This method delegates shallow cloning to a clone() method
      // that each concrete subclass must implement
      cloneNode: { value: function(deep) {
        var clone = this.clone();
        if (deep) {
          for (var kid = this.firstChild; kid !== null; kid = kid.nextSibling) {
            clone._appendChild(kid.cloneNode(true));
          }
        }
        return clone;
      } },
      lookupPrefix: { value: function lookupPrefix(ns) {
        var e;
        if (ns === "" || ns === null || ns === void 0) return null;
        switch (this.nodeType) {
          case ELEMENT_NODE:
            return this._lookupNamespacePrefix(ns, this);
          case DOCUMENT_NODE:
            e = this.documentElement;
            return e ? e.lookupPrefix(ns) : null;
          case ENTITY_NODE:
          case NOTATION_NODE:
          case DOCUMENT_FRAGMENT_NODE:
          case DOCUMENT_TYPE_NODE:
            return null;
          case ATTRIBUTE_NODE:
            e = this.ownerElement;
            return e ? e.lookupPrefix(ns) : null;
          default:
            e = this.parentElement;
            return e ? e.lookupPrefix(ns) : null;
        }
      } },
      lookupNamespaceURI: { value: function lookupNamespaceURI(prefix) {
        if (prefix === "" || prefix === void 0) {
          prefix = null;
        }
        var e;
        switch (this.nodeType) {
          case ELEMENT_NODE:
            return utils.shouldOverride();
          case DOCUMENT_NODE:
            e = this.documentElement;
            return e ? e.lookupNamespaceURI(prefix) : null;
          case ENTITY_NODE:
          case NOTATION_NODE:
          case DOCUMENT_TYPE_NODE:
          case DOCUMENT_FRAGMENT_NODE:
            return null;
          case ATTRIBUTE_NODE:
            e = this.ownerElement;
            return e ? e.lookupNamespaceURI(prefix) : null;
          default:
            e = this.parentElement;
            return e ? e.lookupNamespaceURI(prefix) : null;
        }
      } },
      isDefaultNamespace: { value: function isDefaultNamespace(ns) {
        if (ns === "" || ns === void 0) {
          ns = null;
        }
        var defaultNamespace = this.lookupNamespaceURI(null);
        return defaultNamespace === ns;
      } },
      // Utility methods for nodes.  Not part of the DOM
      // Return the index of this node in its parent.
      // Throw if no parent, or if this node is not a child of its parent
      index: { get: function() {
        var parent = this.parentNode;
        if (this === parent.firstChild) return 0;
        var kids = parent.childNodes;
        if (this._index === void 0 || kids[this._index] !== this) {
          for (var i = 0; i < kids.length; i++) {
            kids[i]._index = i;
          }
          utils.assert(kids[this._index] === this);
        }
        return this._index;
      } },
      // Return true if this node is equal to or is an ancestor of that node
      // Note that nodes are considered to be ancestors of themselves
      isAncestor: { value: function(that) {
        if (this.doc !== that.doc) return false;
        if (this.rooted !== that.rooted) return false;
        for (var e = that; e; e = e.parentNode) {
          if (e === this) return true;
        }
        return false;
      } },
      // DOMINO Changed the behavior to conform with the specs. See:
      // https://groups.google.com/d/topic/mozilla.dev.platform/77sIYcpdDmc/discussion
      ensureSameDoc: { value: function(that) {
        if (that.ownerDocument === null) {
          that.ownerDocument = this.doc;
        } else if (that.ownerDocument !== this.doc) {
          utils.WrongDocumentError();
        }
      } },
      removeChildren: { value: utils.shouldOverride },
      // Insert this node as a child of parent before the specified child,
      // or insert as the last child of parent if specified child is null,
      // or replace the specified child with this node, firing mutation events as
      // necessary
      _insertOrReplace: { value: function _insertOrReplace(parent, before, isReplace) {
        var child = this, before_index, i;
        if (child.nodeType === DOCUMENT_FRAGMENT_NODE && child.rooted) {
          utils.HierarchyRequestError();
        }
        if (parent._childNodes) {
          before_index = before === null ? parent._childNodes.length : before.index;
          if (child.parentNode === parent) {
            var child_index = child.index;
            if (child_index < before_index) {
              before_index--;
            }
          }
        }
        if (isReplace) {
          if (before.rooted) before.doc.mutateRemove(before);
          before.parentNode = null;
        }
        var n = before;
        if (n === null) {
          n = parent.firstChild;
        }
        var bothRooted = child.rooted && parent.rooted;
        if (child.nodeType === DOCUMENT_FRAGMENT_NODE) {
          var spliceArgs = [0, isReplace ? 1 : 0], next;
          for (var kid = child.firstChild; kid !== null; kid = next) {
            next = kid.nextSibling;
            spliceArgs.push(kid);
            kid.parentNode = parent;
          }
          var len = spliceArgs.length;
          if (isReplace) {
            LinkedList.replace(n, len > 2 ? spliceArgs[2] : null);
          } else if (len > 2 && n !== null) {
            LinkedList.insertBefore(spliceArgs[2], n);
          }
          if (parent._childNodes) {
            spliceArgs[0] = before === null ? parent._childNodes.length : before._index;
            parent._childNodes.splice.apply(parent._childNodes, spliceArgs);
            for (i = 2; i < len; i++) {
              spliceArgs[i]._index = spliceArgs[0] + (i - 2);
            }
          } else if (parent._firstChild === before) {
            if (len > 2) {
              parent._firstChild = spliceArgs[2];
            } else if (isReplace) {
              parent._firstChild = null;
            }
          }
          if (child._childNodes) {
            child._childNodes.length = 0;
          } else {
            child._firstChild = null;
          }
          if (parent.rooted) {
            parent.modify();
            for (i = 2; i < len; i++) {
              parent.doc.mutateInsert(spliceArgs[i]);
            }
          }
        } else {
          if (before === child) {
            return;
          }
          if (bothRooted) {
            child._remove();
          } else if (child.parentNode) {
            child.remove();
          }
          child.parentNode = parent;
          if (isReplace) {
            LinkedList.replace(n, child);
            if (parent._childNodes) {
              child._index = before_index;
              parent._childNodes[before_index] = child;
            } else if (parent._firstChild === before) {
              parent._firstChild = child;
            }
          } else {
            if (n !== null) {
              LinkedList.insertBefore(child, n);
            }
            if (parent._childNodes) {
              child._index = before_index;
              parent._childNodes.splice(before_index, 0, child);
            } else if (parent._firstChild === before) {
              parent._firstChild = child;
            }
          }
          if (bothRooted) {
            parent.modify();
            parent.doc.mutateMove(child);
          } else if (parent.rooted) {
            parent.modify();
            parent.doc.mutateInsert(child);
          }
        }
      } },
      // Return the lastModTime value for this node. (For use as a
      // cache invalidation mechanism. If the node does not already
      // have one, initialize it from the owner document's modclock
      // property. (Note that modclock does not return the actual
      // time; it is simply a counter incremented on each document
      // modification)
      lastModTime: { get: function() {
        if (!this._lastModTime) {
          this._lastModTime = this.doc.modclock;
        }
        return this._lastModTime;
      } },
      // Increment the owner document's modclock and use the new
      // value to update the lastModTime value for this node and
      // all of its ancestors. Nodes that have never had their
      // lastModTime value queried do not need to have a
      // lastModTime property set on them since there is no
      // previously queried value to ever compare the new value
      // against, so only update nodes that already have a
      // _lastModTime property.
      modify: { value: function() {
        if (this.doc.modclock) {
          var time = ++this.doc.modclock;
          for (var n = this; n; n = n.parentElement) {
            if (n._lastModTime) {
              n._lastModTime = time;
            }
          }
        }
      } },
      // This attribute is not part of the DOM but is quite helpful.
      // It returns the document with which a node is associated.  Usually
      // this is the ownerDocument. But ownerDocument is null for the
      // document object itself, so this is a handy way to get the document
      // regardless of the node type
      doc: { get: function() {
        return this.ownerDocument || this;
      } },
      // If the node has a nid (node id), then it is rooted in a document
      rooted: { get: function() {
        return !!this._nid;
      } },
      normalize: { value: function() {
        var next;
        for (var child = this.firstChild; child !== null; child = next) {
          next = child.nextSibling;
          if (child.normalize) {
            child.normalize();
          }
          if (child.nodeType !== Node.TEXT_NODE) {
            continue;
          }
          if (child.nodeValue === "") {
            this.removeChild(child);
            continue;
          }
          var prevChild = child.previousSibling;
          if (prevChild === null) {
            continue;
          } else if (prevChild.nodeType === Node.TEXT_NODE) {
            prevChild.appendData(child.nodeValue);
            this.removeChild(child);
          }
        }
      } },
      // Convert the children of a node to an HTML string.
      // This is used by the innerHTML getter
      // The serialization spec is at:
      // http://www.whatwg.org/specs/web-apps/current-work/multipage/the-end.html#serializing-html-fragments
      //
      // The serialization logic is intentionally implemented in a separate
      // `NodeUtils` helper instead of the more obvious choice of a private
      // `_serializeOne()` method on the `Node.prototype` in order to avoid
      // the megamorphic `this._serializeOne` property access, which reduces
      // performance unnecessarily. If you need specialized behavior for a
      // certain subclass, you'll need to implement that in `NodeUtils`.
      // See https://github.com/fgnass/domino/pull/142 for more information.
      serialize: { value: function() {
        if (this._innerHTML) {
          return this._innerHTML;
        }
        var s = "";
        for (var kid = this.firstChild; kid !== null; kid = kid.nextSibling) {
          s += NodeUtils.serializeOne(kid, this);
        }
        return s;
      } },
      // Non-standard, but often useful for debugging.
      outerHTML: {
        get: function() {
          return NodeUtils.serializeOne(this, { nodeType: 0 });
        },
        set: utils.nyi
      },
      // mirror node type properties in the prototype, so they are present
      // in instances of Node (and subclasses)
      ELEMENT_NODE: { value: ELEMENT_NODE },
      ATTRIBUTE_NODE: { value: ATTRIBUTE_NODE },
      TEXT_NODE: { value: TEXT_NODE },
      CDATA_SECTION_NODE: { value: CDATA_SECTION_NODE },
      ENTITY_REFERENCE_NODE: { value: ENTITY_REFERENCE_NODE },
      ENTITY_NODE: { value: ENTITY_NODE },
      PROCESSING_INSTRUCTION_NODE: { value: PROCESSING_INSTRUCTION_NODE },
      COMMENT_NODE: { value: COMMENT_NODE },
      DOCUMENT_NODE: { value: DOCUMENT_NODE },
      DOCUMENT_TYPE_NODE: { value: DOCUMENT_TYPE_NODE },
      DOCUMENT_FRAGMENT_NODE: { value: DOCUMENT_FRAGMENT_NODE },
      NOTATION_NODE: { value: NOTATION_NODE },
      DOCUMENT_POSITION_DISCONNECTED: { value: DOCUMENT_POSITION_DISCONNECTED },
      DOCUMENT_POSITION_PRECEDING: { value: DOCUMENT_POSITION_PRECEDING },
      DOCUMENT_POSITION_FOLLOWING: { value: DOCUMENT_POSITION_FOLLOWING },
      DOCUMENT_POSITION_CONTAINS: { value: DOCUMENT_POSITION_CONTAINS },
      DOCUMENT_POSITION_CONTAINED_BY: { value: DOCUMENT_POSITION_CONTAINED_BY },
      DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: { value: DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NodeList.es6.js
var require_NodeList_es6 = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NodeList.es6.js"(exports2, module2) {
    "use strict";
    module2.exports = class NodeList extends Array {
      constructor(a) {
        super(a && a.length || 0);
        if (a) {
          for (var idx in a) {
            this[idx] = a[idx];
          }
        }
      }
      item(i) {
        return this[i] || null;
      }
    };
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NodeList.es5.js
var require_NodeList_es5 = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NodeList.es5.js"(exports2, module2) {
    "use strict";
    function item(i) {
      return this[i] || null;
    }
    function NodeList(a) {
      if (!a) a = [];
      a.item = item;
      return a;
    }
    module2.exports = NodeList;
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NodeList.js
var require_NodeList = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NodeList.js"(exports2, module2) {
    "use strict";
    var NodeList;
    try {
      NodeList = require_NodeList_es6();
    } catch (e) {
      NodeList = require_NodeList_es5();
    }
    module2.exports = NodeList;
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/ContainerNode.js
var require_ContainerNode = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/ContainerNode.js"(exports2, module2) {
    "use strict";
    module2.exports = ContainerNode;
    var Node = require_Node();
    var NodeList = require_NodeList();
    function ContainerNode() {
      Node.call(this);
      this._firstChild = this._childNodes = null;
    }
    ContainerNode.prototype = Object.create(Node.prototype, {
      hasChildNodes: { value: function() {
        if (this._childNodes) {
          return this._childNodes.length > 0;
        }
        return this._firstChild !== null;
      } },
      childNodes: { get: function() {
        this._ensureChildNodes();
        return this._childNodes;
      } },
      firstChild: { get: function() {
        if (this._childNodes) {
          return this._childNodes.length === 0 ? null : this._childNodes[0];
        }
        return this._firstChild;
      } },
      lastChild: { get: function() {
        var kids = this._childNodes, first;
        if (kids) {
          return kids.length === 0 ? null : kids[kids.length - 1];
        }
        first = this._firstChild;
        if (first === null) {
          return null;
        }
        return first._previousSibling;
      } },
      _ensureChildNodes: { value: function() {
        if (this._childNodes) {
          return;
        }
        var first = this._firstChild, kid = first, childNodes = this._childNodes = new NodeList();
        if (first) do {
          childNodes.push(kid);
          kid = kid._nextSibling;
        } while (kid !== first);
        this._firstChild = null;
      } },
      // Remove all of this node's children.  This is a minor
      // optimization that only calls modify() once.
      removeChildren: { value: function removeChildren() {
        var root = this.rooted ? this.ownerDocument : null, next = this.firstChild, kid;
        while (next !== null) {
          kid = next;
          next = kid.nextSibling;
          if (root) root.mutateRemove(kid);
          kid.parentNode = null;
        }
        if (this._childNodes) {
          this._childNodes.length = 0;
        } else {
          this._firstChild = null;
        }
        this.modify();
      } }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/xmlnames.js
var require_xmlnames = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/xmlnames.js"(exports2) {
    "use strict";
    exports2.isValidName = isValidName;
    exports2.isValidQName = isValidQName;
    var simplename = /^[_:A-Za-z][-.:\w]+$/;
    var simpleqname = /^([_A-Za-z][-.\w]+|[_A-Za-z][-.\w]+:[_A-Za-z][-.\w]+)$/;
    var ncnamestartchars = "_A-Za-z\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD";
    var ncnamechars = "-._A-Za-z0-9\xB7\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0300-\u037D\u037F-\u1FFF\u200C\u200D\u203F\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD";
    var ncname = "[" + ncnamestartchars + "][" + ncnamechars + "]*";
    var namestartchars = ncnamestartchars + ":";
    var namechars = ncnamechars + ":";
    var name = new RegExp("^[" + namestartchars + "][" + namechars + "]*$");
    var qname = new RegExp("^(" + ncname + "|" + ncname + ":" + ncname + ")$");
    var hassurrogates = /[\uD800-\uDB7F\uDC00-\uDFFF]/;
    var surrogatechars = /[\uD800-\uDB7F\uDC00-\uDFFF]/g;
    var surrogatepairs = /[\uD800-\uDB7F][\uDC00-\uDFFF]/g;
    ncnamestartchars += "\uD800-\u{EFC00}-\uDFFF";
    ncnamechars += "\uD800-\u{EFC00}-\uDFFF";
    ncname = "[" + ncnamestartchars + "][" + ncnamechars + "]*";
    namestartchars = ncnamestartchars + ":";
    namechars = ncnamechars + ":";
    var surrogatename = new RegExp("^[" + namestartchars + "][" + namechars + "]*$");
    var surrogateqname = new RegExp("^(" + ncname + "|" + ncname + ":" + ncname + ")$");
    function isValidName(s) {
      if (simplename.test(s)) return true;
      if (name.test(s)) return true;
      if (!hassurrogates.test(s)) return false;
      if (!surrogatename.test(s)) return false;
      var chars = s.match(surrogatechars), pairs = s.match(surrogatepairs);
      return pairs !== null && 2 * pairs.length === chars.length;
    }
    function isValidQName(s) {
      if (simpleqname.test(s)) return true;
      if (qname.test(s)) return true;
      if (!hassurrogates.test(s)) return false;
      if (!surrogateqname.test(s)) return false;
      var chars = s.match(surrogatechars), pairs = s.match(surrogatepairs);
      return pairs !== null && 2 * pairs.length === chars.length;
    }
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/attributes.js
var require_attributes = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/attributes.js"(exports2) {
    "use strict";
    var utils = require_utils();
    exports2.property = function(attr) {
      if (Array.isArray(attr.type)) {
        var valid = /* @__PURE__ */ Object.create(null);
        attr.type.forEach(function(val) {
          valid[val.value || val] = val.alias || val;
        });
        var missingValueDefault = attr.missing;
        if (missingValueDefault === void 0) {
          missingValueDefault = null;
        }
        var invalidValueDefault = attr.invalid;
        if (invalidValueDefault === void 0) {
          invalidValueDefault = missingValueDefault;
        }
        return {
          get: function() {
            var v = this._getattr(attr.name);
            if (v === null) return missingValueDefault;
            v = valid[v.toLowerCase()];
            if (v !== void 0) return v;
            if (invalidValueDefault !== null) return invalidValueDefault;
            return v;
          },
          set: function(v) {
            this._setattr(attr.name, v);
          }
        };
      } else if (attr.type === Boolean) {
        return {
          get: function() {
            return this.hasAttribute(attr.name);
          },
          set: function(v) {
            if (v) {
              this._setattr(attr.name, "");
            } else {
              this.removeAttribute(attr.name);
            }
          }
        };
      } else if (attr.type === Number || attr.type === "long" || attr.type === "unsigned long" || attr.type === "limited unsigned long with fallback") {
        return numberPropDesc(attr);
      } else if (!attr.type || attr.type === String) {
        return {
          get: function() {
            return this._getattr(attr.name) || "";
          },
          set: function(v) {
            if (attr.treatNullAsEmptyString && v === null) {
              v = "";
            }
            this._setattr(attr.name, v);
          }
        };
      } else if (typeof attr.type === "function") {
        return attr.type(attr.name, attr);
      }
      throw new Error("Invalid attribute definition");
    };
    function numberPropDesc(a) {
      var def;
      if (typeof a.default === "function") {
        def = a.default;
      } else if (typeof a.default === "number") {
        def = function() {
          return a.default;
        };
      } else {
        def = function() {
          utils.assert(false, typeof a.default);
        };
      }
      var unsigned_long = a.type === "unsigned long";
      var signed_long = a.type === "long";
      var unsigned_fallback = a.type === "limited unsigned long with fallback";
      var min = a.min, max = a.max, setmin = a.setmin;
      if (min === void 0) {
        if (unsigned_long) min = 0;
        if (signed_long) min = -2147483648;
        if (unsigned_fallback) min = 1;
      }
      if (max === void 0) {
        if (unsigned_long || signed_long || unsigned_fallback) max = 2147483647;
      }
      return {
        get: function() {
          var v = this._getattr(a.name);
          var n = a.float ? parseFloat(v) : parseInt(v, 10);
          if (v === null || !isFinite(n) || min !== void 0 && n < min || max !== void 0 && n > max) {
            return def.call(this);
          }
          if (unsigned_long || signed_long || unsigned_fallback) {
            if (!/^[ \t\n\f\r]*[-+]?[0-9]/.test(v)) {
              return def.call(this);
            }
            n = n | 0;
          }
          return n;
        },
        set: function(v) {
          if (!a.float) {
            v = Math.floor(v);
          }
          if (setmin !== void 0 && v < setmin) {
            utils.IndexSizeError(a.name + " set to " + v);
          }
          if (unsigned_long) {
            v = v < 0 || v > 2147483647 ? def.call(this) : v | 0;
          } else if (unsigned_fallback) {
            v = v < 1 || v > 2147483647 ? def.call(this) : v | 0;
          } else if (signed_long) {
            v = v < -2147483648 || v > 2147483647 ? def.call(this) : v | 0;
          }
          this._setattr(a.name, String(v));
        }
      };
    }
    exports2.registerChangeHandler = function(c, name, handler) {
      var p = c.prototype;
      if (!Object.prototype.hasOwnProperty.call(p, "_attributeChangeHandlers")) {
        p._attributeChangeHandlers = Object.create(p._attributeChangeHandlers || null);
      }
      p._attributeChangeHandlers[name] = handler;
    };
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/FilteredElementList.js
var require_FilteredElementList = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/FilteredElementList.js"(exports2, module2) {
    "use strict";
    module2.exports = FilteredElementList;
    var Node = require_Node();
    function FilteredElementList(root, filter) {
      this.root = root;
      this.filter = filter;
      this.lastModTime = root.lastModTime;
      this.done = false;
      this.cache = [];
      this.traverse();
    }
    FilteredElementList.prototype = Object.create(Object.prototype, {
      length: { get: function() {
        this.checkcache();
        if (!this.done) this.traverse();
        return this.cache.length;
      } },
      item: { value: function(n) {
        this.checkcache();
        if (!this.done && n >= this.cache.length) {
          this.traverse(
            /*n*/
          );
        }
        return this.cache[n];
      } },
      checkcache: { value: function() {
        if (this.lastModTime !== this.root.lastModTime) {
          for (var i = this.cache.length - 1; i >= 0; i--) {
            this[i] = void 0;
          }
          this.cache.length = 0;
          this.done = false;
          this.lastModTime = this.root.lastModTime;
        }
      } },
      // If n is specified, then traverse the tree until we've found the nth
      // item (or until we've found all items).  If n is not specified,
      // traverse until we've found all items.
      traverse: { value: function(n) {
        if (n !== void 0) n++;
        var elt;
        while ((elt = this.next()) !== null) {
          this[this.cache.length] = elt;
          this.cache.push(elt);
          if (n && this.cache.length === n) return;
        }
        this.done = true;
      } },
      // Return the next element under root that matches filter
      next: { value: function() {
        var start = this.cache.length === 0 ? this.root : this.cache[this.cache.length - 1];
        var elt;
        if (start.nodeType === Node.DOCUMENT_NODE)
          elt = start.documentElement;
        else
          elt = start.nextElement(this.root);
        while (elt) {
          if (this.filter(elt)) {
            return elt;
          }
          elt = elt.nextElement(this.root);
        }
        return null;
      } }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/DOMTokenList.js
var require_DOMTokenList = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/DOMTokenList.js"(exports2, module2) {
    "use strict";
    var utils = require_utils();
    module2.exports = DOMTokenList;
    function DOMTokenList(getter, setter) {
      this._getString = getter;
      this._setString = setter;
      this._length = 0;
      this._lastStringValue = "";
      this._update();
    }
    Object.defineProperties(DOMTokenList.prototype, {
      length: { get: function() {
        return this._length;
      } },
      item: { value: function(index) {
        var list = getList(this);
        if (index < 0 || index >= list.length) {
          return null;
        }
        return list[index];
      } },
      contains: { value: function(token) {
        token = String(token);
        var list = getList(this);
        return list.indexOf(token) > -1;
      } },
      add: { value: function() {
        var list = getList(this);
        for (var i = 0, len = arguments.length; i < len; i++) {
          var token = handleErrors(arguments[i]);
          if (list.indexOf(token) < 0) {
            list.push(token);
          }
        }
        this._update(list);
      } },
      remove: { value: function() {
        var list = getList(this);
        for (var i = 0, len = arguments.length; i < len; i++) {
          var token = handleErrors(arguments[i]);
          var index = list.indexOf(token);
          if (index > -1) {
            list.splice(index, 1);
          }
        }
        this._update(list);
      } },
      toggle: { value: function toggle(token, force) {
        token = handleErrors(token);
        if (this.contains(token)) {
          if (force === void 0 || force === false) {
            this.remove(token);
            return false;
          }
          return true;
        } else {
          if (force === void 0 || force === true) {
            this.add(token);
            return true;
          }
          return false;
        }
      } },
      replace: { value: function replace(token, newToken) {
        if (String(newToken) === "") {
          utils.SyntaxError();
        }
        token = handleErrors(token);
        newToken = handleErrors(newToken);
        var list = getList(this);
        var idx = list.indexOf(token);
        if (idx < 0) {
          return false;
        }
        var idx2 = list.indexOf(newToken);
        if (idx2 < 0) {
          list[idx] = newToken;
        } else {
          if (idx < idx2) {
            list[idx] = newToken;
            list.splice(idx2, 1);
          } else {
            list.splice(idx, 1);
          }
        }
        this._update(list);
        return true;
      } },
      toString: { value: function() {
        return this._getString();
      } },
      value: {
        get: function() {
          return this._getString();
        },
        set: function(v) {
          this._setString(v);
          this._update();
        }
      },
      // Called when the setter is called from outside this interface.
      _update: { value: function(list) {
        if (list) {
          fixIndex(this, list);
          this._setString(list.join(" ").trim());
        } else {
          fixIndex(this, getList(this));
        }
        this._lastStringValue = this._getString();
      } }
    });
    function fixIndex(clist, list) {
      var oldLength = clist._length;
      var i;
      clist._length = list.length;
      for (i = 0; i < list.length; i++) {
        clist[i] = list[i];
      }
      for (; i < oldLength; i++) {
        clist[i] = void 0;
      }
    }
    function handleErrors(token) {
      token = String(token);
      if (token === "") {
        utils.SyntaxError();
      }
      if (/[ \t\r\n\f]/.test(token)) {
        utils.InvalidCharacterError();
      }
      return token;
    }
    function toArray(clist) {
      var length = clist._length;
      var arr = Array(length);
      for (var i = 0; i < length; i++) {
        arr[i] = clist[i];
      }
      return arr;
    }
    function getList(clist) {
      var strProp = clist._getString();
      if (strProp === clist._lastStringValue) {
        return toArray(clist);
      }
      var str = strProp.replace(/(^[ \t\r\n\f]+)|([ \t\r\n\f]+$)/g, "");
      if (str === "") {
        return [];
      } else {
        var seen = /* @__PURE__ */ Object.create(null);
        return str.split(/[ \t\r\n\f]+/g).filter(function(n) {
          var key = "$" + n;
          if (seen[key]) {
            return false;
          }
          seen[key] = true;
          return true;
        });
      }
    }
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/select.js
var require_select = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/select.js"(exports2, module2) {
    "use strict";
    var window2 = Object.create(null, {
      location: { get: function() {
        throw new Error("window.location is not supported.");
      } }
    });
    var compareDocumentPosition = function(a, b) {
      return a.compareDocumentPosition(b);
    };
    var order = function(a, b) {
      return compareDocumentPosition(a, b) & 2 ? 1 : -1;
    };
    var next = function(el) {
      while ((el = el.nextSibling) && el.nodeType !== 1) ;
      return el;
    };
    var prev = function(el) {
      while ((el = el.previousSibling) && el.nodeType !== 1) ;
      return el;
    };
    var child = function(el) {
      if (el = el.firstChild) {
        while (el.nodeType !== 1 && (el = el.nextSibling)) ;
      }
      return el;
    };
    var lastChild = function(el) {
      if (el = el.lastChild) {
        while (el.nodeType !== 1 && (el = el.previousSibling)) ;
      }
      return el;
    };
    var parentIsElement = function(n) {
      if (!n.parentNode) {
        return false;
      }
      var nodeType = n.parentNode.nodeType;
      return nodeType === 1 || nodeType === 9;
    };
    var unquote = function(str) {
      if (!str) return str;
      var ch = str[0];
      if (ch === '"' || ch === "'") {
        if (str[str.length - 1] === ch) {
          str = str.slice(1, -1);
        } else {
          str = str.slice(1);
        }
        return str.replace(rules.str_escape, function(s) {
          var m = /^\\(?:([0-9A-Fa-f]+)|([\r\n\f]+))/.exec(s);
          if (!m) {
            return s.slice(1);
          }
          if (m[2]) {
            return "";
          }
          var cp = parseInt(m[1], 16);
          return String.fromCodePoint ? String.fromCodePoint(cp) : (
            // Not all JavaScript implementations have String.fromCodePoint yet.
            String.fromCharCode(cp)
          );
        });
      } else if (rules.ident.test(str)) {
        return decodeid(str);
      } else {
        return str;
      }
    };
    var decodeid = function(str) {
      return str.replace(rules.escape, function(s) {
        var m = /^\\([0-9A-Fa-f]+)/.exec(s);
        if (!m) {
          return s[1];
        }
        var cp = parseInt(m[1], 16);
        return String.fromCodePoint ? String.fromCodePoint(cp) : (
          // Not all JavaScript implementations have String.fromCodePoint yet.
          String.fromCharCode(cp)
        );
      });
    };
    var indexOf = function() {
      if (Array.prototype.indexOf) {
        return Array.prototype.indexOf;
      }
      return function(obj, item) {
        var i = this.length;
        while (i--) {
          if (this[i] === item) return i;
        }
        return -1;
      };
    }();
    var makeInside = function(start, end) {
      var regex = rules.inside.source.replace(/</g, start).replace(/>/g, end);
      return new RegExp(regex);
    };
    var replace = function(regex, name, val) {
      regex = regex.source;
      regex = regex.replace(name, val.source || val);
      return new RegExp(regex);
    };
    var truncateUrl = function(url, num) {
      return url.replace(/^(?:\w+:\/\/|\/+)/, "").replace(/(?:\/+|\/*#.*?)$/, "").split("/", num).join("/");
    };
    var parseNth = function(param_, test) {
      var param = param_.replace(/\s+/g, ""), cap;
      if (param === "even") {
        param = "2n+0";
      } else if (param === "odd") {
        param = "2n+1";
      } else if (param.indexOf("n") === -1) {
        param = "0n" + param;
      }
      cap = /^([+-])?(\d+)?n([+-])?(\d+)?$/.exec(param);
      return {
        group: cap[1] === "-" ? -(cap[2] || 1) : +(cap[2] || 1),
        offset: cap[4] ? cap[3] === "-" ? -cap[4] : +cap[4] : 0
      };
    };
    var nth = function(param_, test, last) {
      var param = parseNth(param_), group = param.group, offset = param.offset, find2 = !last ? child : lastChild, advance = !last ? next : prev;
      return function(el) {
        if (!parentIsElement(el)) return;
        var rel = find2(el.parentNode), pos = 0;
        while (rel) {
          if (test(rel, el)) pos++;
          if (rel === el) {
            pos -= offset;
            return group && pos ? pos % group === 0 && pos < 0 === group < 0 : !pos;
          }
          rel = advance(rel);
        }
      };
    };
    var selectors = {
      "*": function() {
        if (false) {
          return function(el) {
            if (el.nodeType === 1) return true;
          };
        }
        return function() {
          return true;
        };
      }(),
      "type": function(type) {
        type = type.toLowerCase();
        return function(el) {
          return el.nodeName.toLowerCase() === type;
        };
      },
      "attr": function(key, op, val, i) {
        op = operators[op];
        return function(el) {
          var attr;
          switch (key) {
            case "for":
              attr = el.htmlFor;
              break;
            case "class":
              attr = el.className;
              if (attr === "" && el.getAttribute("class") == null) {
                attr = null;
              }
              break;
            case "href":
            case "src":
              attr = el.getAttribute(key, 2);
              break;
            case "title":
              attr = el.getAttribute("title") || null;
              break;
            // careful with attributes with special getter functions
            case "id":
            case "lang":
            case "dir":
            case "accessKey":
            case "hidden":
            case "tabIndex":
            case "style":
              if (el.getAttribute) {
                attr = el.getAttribute(key);
                break;
              }
            /* falls through */
            default:
              if (el.hasAttribute && !el.hasAttribute(key)) {
                break;
              }
              attr = el[key] != null ? el[key] : el.getAttribute && el.getAttribute(key);
              break;
          }
          if (attr == null) return;
          attr = attr + "";
          if (i) {
            attr = attr.toLowerCase();
            val = val.toLowerCase();
          }
          return op(attr, val);
        };
      },
      ":first-child": function(el) {
        return !prev(el) && parentIsElement(el);
      },
      ":last-child": function(el) {
        return !next(el) && parentIsElement(el);
      },
      ":only-child": function(el) {
        return !prev(el) && !next(el) && parentIsElement(el);
      },
      ":nth-child": function(param, last) {
        return nth(param, function() {
          return true;
        }, last);
      },
      ":nth-last-child": function(param) {
        return selectors[":nth-child"](param, true);
      },
      ":root": function(el) {
        return el.ownerDocument.documentElement === el;
      },
      ":empty": function(el) {
        return !el.firstChild;
      },
      ":not": function(sel) {
        var test = compileGroup(sel);
        return function(el) {
          return !test(el);
        };
      },
      ":first-of-type": function(el) {
        if (!parentIsElement(el)) return;
        var type = el.nodeName;
        while (el = prev(el)) {
          if (el.nodeName === type) return;
        }
        return true;
      },
      ":last-of-type": function(el) {
        if (!parentIsElement(el)) return;
        var type = el.nodeName;
        while (el = next(el)) {
          if (el.nodeName === type) return;
        }
        return true;
      },
      ":only-of-type": function(el) {
        return selectors[":first-of-type"](el) && selectors[":last-of-type"](el);
      },
      ":nth-of-type": function(param, last) {
        return nth(param, function(rel, el) {
          return rel.nodeName === el.nodeName;
        }, last);
      },
      ":nth-last-of-type": function(param) {
        return selectors[":nth-of-type"](param, true);
      },
      ":checked": function(el) {
        return !!(el.checked || el.selected);
      },
      ":indeterminate": function(el) {
        return !selectors[":checked"](el);
      },
      ":enabled": function(el) {
        return !el.disabled && el.type !== "hidden";
      },
      ":disabled": function(el) {
        return !!el.disabled;
      },
      ":target": function(el) {
        return el.id === window2.location.hash.substring(1);
      },
      ":focus": function(el) {
        return el === el.ownerDocument.activeElement;
      },
      ":is": function(sel) {
        return compileGroup(sel);
      },
      // :matches is an older name for :is; see
      // https://github.com/w3c/csswg-drafts/issues/3258
      ":matches": function(sel) {
        return selectors[":is"](sel);
      },
      ":nth-match": function(param, last) {
        var args = param.split(/\s*,\s*/), arg = args.shift(), test = compileGroup(args.join(","));
        return nth(arg, test, last);
      },
      ":nth-last-match": function(param) {
        return selectors[":nth-match"](param, true);
      },
      ":links-here": function(el) {
        return el + "" === window2.location + "";
      },
      ":lang": function(param) {
        return function(el) {
          while (el) {
            if (el.lang) return el.lang.indexOf(param) === 0;
            el = el.parentNode;
          }
        };
      },
      ":dir": function(param) {
        return function(el) {
          while (el) {
            if (el.dir) return el.dir === param;
            el = el.parentNode;
          }
        };
      },
      ":scope": function(el, con) {
        var context = con || el.ownerDocument;
        if (context.nodeType === 9) {
          return el === context.documentElement;
        }
        return el === context;
      },
      ":any-link": function(el) {
        return typeof el.href === "string";
      },
      ":local-link": function(el) {
        if (el.nodeName) {
          return el.href && el.host === window2.location.host;
        }
        var param = +el + 1;
        return function(el2) {
          if (!el2.href) return;
          var url = window2.location + "", href = el2 + "";
          return truncateUrl(url, param) === truncateUrl(href, param);
        };
      },
      ":default": function(el) {
        return !!el.defaultSelected;
      },
      ":valid": function(el) {
        return el.willValidate || el.validity && el.validity.valid;
      },
      ":invalid": function(el) {
        return !selectors[":valid"](el);
      },
      ":in-range": function(el) {
        return el.value > el.min && el.value <= el.max;
      },
      ":out-of-range": function(el) {
        return !selectors[":in-range"](el);
      },
      ":required": function(el) {
        return !!el.required;
      },
      ":optional": function(el) {
        return !el.required;
      },
      ":read-only": function(el) {
        if (el.readOnly) return true;
        var attr = el.getAttribute("contenteditable"), prop = el.contentEditable, name = el.nodeName.toLowerCase();
        name = name !== "input" && name !== "textarea";
        return (name || el.disabled) && attr == null && prop !== "true";
      },
      ":read-write": function(el) {
        return !selectors[":read-only"](el);
      },
      ":hover": function() {
        throw new Error(":hover is not supported.");
      },
      ":active": function() {
        throw new Error(":active is not supported.");
      },
      ":link": function() {
        throw new Error(":link is not supported.");
      },
      ":visited": function() {
        throw new Error(":visited is not supported.");
      },
      ":column": function() {
        throw new Error(":column is not supported.");
      },
      ":nth-column": function() {
        throw new Error(":nth-column is not supported.");
      },
      ":nth-last-column": function() {
        throw new Error(":nth-last-column is not supported.");
      },
      ":current": function() {
        throw new Error(":current is not supported.");
      },
      ":past": function() {
        throw new Error(":past is not supported.");
      },
      ":future": function() {
        throw new Error(":future is not supported.");
      },
      // Non-standard, for compatibility purposes.
      ":contains": function(param) {
        return function(el) {
          var text = el.innerText || el.textContent || el.value || "";
          return text.indexOf(param) !== -1;
        };
      },
      ":has": function(param) {
        return function(el) {
          return find(param, el).length > 0;
        };
      }
      // Potentially add more pseudo selectors for
      // compatibility with sizzle and most other
      // selector engines (?).
    };
    var operators = {
      "-": function() {
        return true;
      },
      "=": function(attr, val) {
        return attr === val;
      },
      "*=": function(attr, val) {
        return attr.indexOf(val) !== -1;
      },
      "~=": function(attr, val) {
        var i, s, f, l;
        for (s = 0; true; s = i + 1) {
          i = attr.indexOf(val, s);
          if (i === -1) return false;
          f = attr[i - 1];
          l = attr[i + val.length];
          if ((!f || f === " ") && (!l || l === " ")) return true;
        }
      },
      "|=": function(attr, val) {
        var i = attr.indexOf(val), l;
        if (i !== 0) return;
        l = attr[i + val.length];
        return l === "-" || !l;
      },
      "^=": function(attr, val) {
        return attr.indexOf(val) === 0;
      },
      "$=": function(attr, val) {
        var i = attr.lastIndexOf(val);
        return i !== -1 && i + val.length === attr.length;
      },
      // non-standard
      "!=": function(attr, val) {
        return attr !== val;
      }
    };
    var combinators = {
      " ": function(test) {
        return function(el) {
          while (el = el.parentNode) {
            if (test(el)) return el;
          }
        };
      },
      ">": function(test) {
        return function(el) {
          if (el = el.parentNode) {
            return test(el) && el;
          }
        };
      },
      "+": function(test) {
        return function(el) {
          if (el = prev(el)) {
            return test(el) && el;
          }
        };
      },
      "~": function(test) {
        return function(el) {
          while (el = prev(el)) {
            if (test(el)) return el;
          }
        };
      },
      "noop": function(test) {
        return function(el) {
          return test(el) && el;
        };
      },
      "ref": function(test, name) {
        var node;
        function ref(el) {
          var doc = el.ownerDocument, nodes = doc.getElementsByTagName("*"), i = nodes.length;
          while (i--) {
            node = nodes[i];
            if (ref.test(el)) {
              node = null;
              return true;
            }
          }
          node = null;
        }
        ref.combinator = function(el) {
          if (!node || !node.getAttribute) return;
          var attr = node.getAttribute(name) || "";
          if (attr[0] === "#") attr = attr.substring(1);
          if (attr === el.id && test(node)) {
            return node;
          }
        };
        return ref;
      }
    };
    var rules = {
      escape: /\\(?:[^0-9A-Fa-f\r\n]|[0-9A-Fa-f]{1,6}[\r\n\t ]?)/g,
      str_escape: /(escape)|\\(\n|\r\n?|\f)/g,
      nonascii: /[\u00A0-\uFFFF]/,
      cssid: /(?:(?!-?[0-9])(?:escape|nonascii|[-_a-zA-Z0-9])+)/,
      qname: /^ *(cssid|\*)/,
      simple: /^(?:([.#]cssid)|pseudo|attr)/,
      ref: /^ *\/(cssid)\/ */,
      combinator: /^(?: +([^ \w*.#\\]) +|( )+|([^ \w*.#\\]))(?! *$)/,
      attr: /^\[(cssid)(?:([^\w]?=)(inside))?\]/,
      pseudo: /^(:cssid)(?:\((inside)\))?/,
      inside: /(?:"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|<[^"'>]*>|\\["'>]|[^"'>])*/,
      ident: /^(cssid)$/
    };
    rules.cssid = replace(rules.cssid, "nonascii", rules.nonascii);
    rules.cssid = replace(rules.cssid, "escape", rules.escape);
    rules.qname = replace(rules.qname, "cssid", rules.cssid);
    rules.simple = replace(rules.simple, "cssid", rules.cssid);
    rules.ref = replace(rules.ref, "cssid", rules.cssid);
    rules.attr = replace(rules.attr, "cssid", rules.cssid);
    rules.pseudo = replace(rules.pseudo, "cssid", rules.cssid);
    rules.inside = replace(rules.inside, `[^"'>]*`, rules.inside);
    rules.attr = replace(rules.attr, "inside", makeInside("\\[", "\\]"));
    rules.pseudo = replace(rules.pseudo, "inside", makeInside("\\(", "\\)"));
    rules.simple = replace(rules.simple, "pseudo", rules.pseudo);
    rules.simple = replace(rules.simple, "attr", rules.attr);
    rules.ident = replace(rules.ident, "cssid", rules.cssid);
    rules.str_escape = replace(rules.str_escape, "escape", rules.escape);
    var compile = function(sel_) {
      var sel = sel_.replace(/^\s+|\s+$/g, ""), test, filter = [], buff = [], subject, qname, cap, op, ref;
      while (sel) {
        if (cap = rules.qname.exec(sel)) {
          sel = sel.substring(cap[0].length);
          qname = decodeid(cap[1]);
          buff.push(tok(qname, true));
        } else if (cap = rules.simple.exec(sel)) {
          sel = sel.substring(cap[0].length);
          qname = "*";
          buff.push(tok(qname, true));
          buff.push(tok(cap));
        } else {
          throw new SyntaxError("Invalid selector.");
        }
        while (cap = rules.simple.exec(sel)) {
          sel = sel.substring(cap[0].length);
          buff.push(tok(cap));
        }
        if (sel[0] === "!") {
          sel = sel.substring(1);
          subject = makeSubject();
          subject.qname = qname;
          buff.push(subject.simple);
        }
        if (cap = rules.ref.exec(sel)) {
          sel = sel.substring(cap[0].length);
          ref = combinators.ref(makeSimple(buff), decodeid(cap[1]));
          filter.push(ref.combinator);
          buff = [];
          continue;
        }
        if (cap = rules.combinator.exec(sel)) {
          sel = sel.substring(cap[0].length);
          op = cap[1] || cap[2] || cap[3];
          if (op === ",") {
            filter.push(combinators.noop(makeSimple(buff)));
            break;
          }
        } else {
          op = "noop";
        }
        if (!combinators[op]) {
          throw new SyntaxError("Bad combinator.");
        }
        filter.push(combinators[op](makeSimple(buff)));
        buff = [];
      }
      test = makeTest(filter);
      test.qname = qname;
      test.sel = sel;
      if (subject) {
        subject.lname = test.qname;
        subject.test = test;
        subject.qname = subject.qname;
        subject.sel = test.sel;
        test = subject;
      }
      if (ref) {
        ref.test = test;
        ref.qname = test.qname;
        ref.sel = test.sel;
        test = ref;
      }
      return test;
    };
    var tok = function(cap, qname) {
      if (qname) {
        return cap === "*" ? selectors["*"] : selectors.type(cap);
      }
      if (cap[1]) {
        return cap[1][0] === "." ? selectors.attr("class", "~=", decodeid(cap[1].substring(1)), false) : selectors.attr("id", "=", decodeid(cap[1].substring(1)), false);
      }
      if (cap[2]) {
        return cap[3] ? selectors[decodeid(cap[2])](unquote(cap[3])) : selectors[decodeid(cap[2])];
      }
      if (cap[4]) {
        var value = cap[6];
        var i = /["'\s]\s*I$/i.test(value);
        if (i) {
          value = value.replace(/\s*I$/i, "");
        }
        return selectors.attr(decodeid(cap[4]), cap[5] || "-", unquote(value), i);
      }
      throw new SyntaxError("Unknown Selector.");
    };
    var makeSimple = function(func) {
      var l = func.length, i;
      if (l < 2) return func[0];
      return function(el) {
        if (!el) return;
        for (i = 0; i < l; i++) {
          if (!func[i](el)) return;
        }
        return true;
      };
    };
    var makeTest = function(func) {
      if (func.length < 2) {
        return function(el) {
          return !!func[0](el);
        };
      }
      return function(el) {
        var i = func.length;
        while (i--) {
          if (!(el = func[i](el))) return;
        }
        return true;
      };
    };
    var makeSubject = function() {
      var target;
      function subject(el) {
        var node = el.ownerDocument, scope = node.getElementsByTagName(subject.lname), i = scope.length;
        while (i--) {
          if (subject.test(scope[i]) && target === el) {
            target = null;
            return true;
          }
        }
        target = null;
      }
      subject.simple = function(el) {
        target = el;
        return true;
      };
      return subject;
    };
    var compileGroup = function(sel) {
      var test = compile(sel), tests = [test];
      while (test.sel) {
        test = compile(test.sel);
        tests.push(test);
      }
      if (tests.length < 2) return test;
      return function(el) {
        var l = tests.length, i = 0;
        for (; i < l; i++) {
          if (tests[i](el)) return true;
        }
      };
    };
    var find = function(sel, node) {
      var results = [], test = compile(sel), scope = node.getElementsByTagName(test.qname), i = 0, el;
      while (el = scope[i++]) {
        if (test(el)) results.push(el);
      }
      if (test.sel) {
        while (test.sel) {
          test = compile(test.sel);
          scope = node.getElementsByTagName(test.qname);
          i = 0;
          while (el = scope[i++]) {
            if (test(el) && indexOf.call(results, el) === -1) {
              results.push(el);
            }
          }
        }
        results.sort(order);
      }
      return results;
    };
    module2.exports = exports2 = function(sel, context) {
      var id, r;
      if (context.nodeType !== 11 && sel.indexOf(" ") === -1) {
        if (sel[0] === "#" && context.rooted && /^#[A-Z_][-A-Z0-9_]*$/i.test(sel)) {
          if (context.doc._hasMultipleElementsWithId) {
            id = sel.substring(1);
            if (!context.doc._hasMultipleElementsWithId(id)) {
              r = context.doc.getElementById(id);
              return r ? [r] : [];
            }
          }
        }
        if (sel[0] === "." && /^\.\w+$/.test(sel)) {
          return context.getElementsByClassName(sel.substring(1));
        }
        if (/^\w+$/.test(sel)) {
          return context.getElementsByTagName(sel);
        }
      }
      return find(sel, context);
    };
    exports2.selectors = selectors;
    exports2.operators = operators;
    exports2.combinators = combinators;
    exports2.matches = function(el, sel) {
      var test = { sel };
      do {
        test = compile(test.sel);
        if (test(el)) {
          return true;
        }
      } while (test.sel);
      return false;
    };
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/ChildNode.js
var require_ChildNode = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/ChildNode.js"(exports2, module2) {
    "use strict";
    var Node = require_Node();
    var LinkedList = require_LinkedList();
    var createDocumentFragmentFromArguments = function(document, args) {
      var docFrag = document.createDocumentFragment();
      for (var i = 0; i < args.length; i++) {
        var argItem = args[i];
        var isNode = argItem instanceof Node;
        docFrag.appendChild(isNode ? argItem : document.createTextNode(String(argItem)));
      }
      return docFrag;
    };
    var ChildNode = {
      // Inserts a set of Node or String objects in the children list of this
      // ChildNode's parent, just after this ChildNode.  String objects are
      // inserted as the equivalent Text nodes.
      after: { value: function after() {
        var argArr = Array.prototype.slice.call(arguments);
        var parentNode = this.parentNode, nextSibling = this.nextSibling;
        if (parentNode === null) {
          return;
        }
        while (nextSibling && argArr.some(function(v) {
          return v === nextSibling;
        }))
          nextSibling = nextSibling.nextSibling;
        var docFrag = createDocumentFragmentFromArguments(this.doc, argArr);
        parentNode.insertBefore(docFrag, nextSibling);
      } },
      // Inserts a set of Node or String objects in the children list of this
      // ChildNode's parent, just before this ChildNode.  String objects are
      // inserted as the equivalent Text nodes.
      before: { value: function before() {
        var argArr = Array.prototype.slice.call(arguments);
        var parentNode = this.parentNode, prevSibling = this.previousSibling;
        if (parentNode === null) {
          return;
        }
        while (prevSibling && argArr.some(function(v) {
          return v === prevSibling;
        }))
          prevSibling = prevSibling.previousSibling;
        var docFrag = createDocumentFragmentFromArguments(this.doc, argArr);
        var nextSibling = prevSibling ? prevSibling.nextSibling : parentNode.firstChild;
        parentNode.insertBefore(docFrag, nextSibling);
      } },
      // Remove this node from its parent
      remove: { value: function remove() {
        if (this.parentNode === null) return;
        if (this.doc) {
          this.doc._preremoveNodeIterators(this);
          if (this.rooted) {
            this.doc.mutateRemove(this);
          }
        }
        this._remove();
        this.parentNode = null;
      } },
      // Remove this node w/o uprooting or sending mutation events
      // (But do update the structure id for all ancestors)
      _remove: { value: function _remove() {
        var parent = this.parentNode;
        if (parent === null) return;
        if (parent._childNodes) {
          parent._childNodes.splice(this.index, 1);
        } else if (parent._firstChild === this) {
          if (this._nextSibling === this) {
            parent._firstChild = null;
          } else {
            parent._firstChild = this._nextSibling;
          }
        }
        LinkedList.remove(this);
        parent.modify();
      } },
      // Replace this node with the nodes or strings provided as arguments.
      replaceWith: { value: function replaceWith() {
        var argArr = Array.prototype.slice.call(arguments);
        var parentNode = this.parentNode, nextSibling = this.nextSibling;
        if (parentNode === null) {
          return;
        }
        while (nextSibling && argArr.some(function(v) {
          return v === nextSibling;
        }))
          nextSibling = nextSibling.nextSibling;
        var docFrag = createDocumentFragmentFromArguments(this.doc, argArr);
        if (this.parentNode === parentNode) {
          parentNode.replaceChild(docFrag, this);
        } else {
          parentNode.insertBefore(docFrag, nextSibling);
        }
      } }
    };
    module2.exports = ChildNode;
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NonDocumentTypeChildNode.js
var require_NonDocumentTypeChildNode = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NonDocumentTypeChildNode.js"(exports2, module2) {
    "use strict";
    var Node = require_Node();
    var NonDocumentTypeChildNode = {
      nextElementSibling: { get: function() {
        if (this.parentNode) {
          for (var kid = this.nextSibling; kid !== null; kid = kid.nextSibling) {
            if (kid.nodeType === Node.ELEMENT_NODE) return kid;
          }
        }
        return null;
      } },
      previousElementSibling: { get: function() {
        if (this.parentNode) {
          for (var kid = this.previousSibling; kid !== null; kid = kid.previousSibling) {
            if (kid.nodeType === Node.ELEMENT_NODE) return kid;
          }
        }
        return null;
      } }
    };
    module2.exports = NonDocumentTypeChildNode;
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NamedNodeMap.js
var require_NamedNodeMap = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NamedNodeMap.js"(exports2, module2) {
    "use strict";
    module2.exports = NamedNodeMap;
    var utils = require_utils();
    function NamedNodeMap(element) {
      this.element = element;
    }
    Object.defineProperties(NamedNodeMap.prototype, {
      length: { get: utils.shouldOverride },
      item: { value: utils.shouldOverride },
      getNamedItem: { value: function getNamedItem(qualifiedName) {
        return this.element.getAttributeNode(qualifiedName);
      } },
      getNamedItemNS: { value: function getNamedItemNS(namespace, localName) {
        return this.element.getAttributeNodeNS(namespace, localName);
      } },
      setNamedItem: { value: utils.nyi },
      setNamedItemNS: { value: utils.nyi },
      removeNamedItem: { value: function removeNamedItem(qualifiedName) {
        var attr = this.element.getAttributeNode(qualifiedName);
        if (attr) {
          this.element.removeAttribute(qualifiedName);
          return attr;
        }
        utils.NotFoundError();
      } },
      removeNamedItemNS: { value: function removeNamedItemNS(ns, lname) {
        var attr = this.element.getAttributeNodeNS(ns, lname);
        if (attr) {
          this.element.removeAttributeNS(ns, lname);
          return attr;
        }
        utils.NotFoundError();
      } }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Element.js
var require_Element = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Element.js"(exports2, module2) {
    "use strict";
    module2.exports = Element;
    var xml = require_xmlnames();
    var utils = require_utils();
    var NAMESPACE = utils.NAMESPACE;
    var attributes = require_attributes();
    var Node = require_Node();
    var NodeList = require_NodeList();
    var NodeUtils = require_NodeUtils();
    var FilteredElementList = require_FilteredElementList();
    var DOMException = require_DOMException();
    var DOMTokenList = require_DOMTokenList();
    var select = require_select();
    var ContainerNode = require_ContainerNode();
    var ChildNode = require_ChildNode();
    var NonDocumentTypeChildNode = require_NonDocumentTypeChildNode();
    var NamedNodeMap = require_NamedNodeMap();
    var uppercaseCache = /* @__PURE__ */ Object.create(null);
    function Element(doc, localName, namespaceURI, prefix) {
      ContainerNode.call(this);
      this.nodeType = Node.ELEMENT_NODE;
      this.ownerDocument = doc;
      this.localName = localName;
      this.namespaceURI = namespaceURI;
      this.prefix = prefix;
      this._tagName = void 0;
      this._attrsByQName = /* @__PURE__ */ Object.create(null);
      this._attrsByLName = /* @__PURE__ */ Object.create(null);
      this._attrKeys = [];
    }
    function recursiveGetText(node, a) {
      if (node.nodeType === Node.TEXT_NODE) {
        a.push(node._data);
      } else {
        for (var i = 0, n = node.childNodes.length; i < n; i++)
          recursiveGetText(node.childNodes[i], a);
      }
    }
    Element.prototype = Object.create(ContainerNode.prototype, {
      isHTML: { get: function isHTML() {
        return this.namespaceURI === NAMESPACE.HTML && this.ownerDocument.isHTML;
      } },
      tagName: { get: function tagName() {
        if (this._tagName === void 0) {
          var tn;
          if (this.prefix === null) {
            tn = this.localName;
          } else {
            tn = this.prefix + ":" + this.localName;
          }
          if (this.isHTML) {
            var up = uppercaseCache[tn];
            if (!up) {
              uppercaseCache[tn] = up = utils.toASCIIUpperCase(tn);
            }
            tn = up;
          }
          this._tagName = tn;
        }
        return this._tagName;
      } },
      nodeName: { get: function() {
        return this.tagName;
      } },
      nodeValue: {
        get: function() {
          return null;
        },
        set: function() {
        }
      },
      textContent: {
        get: function() {
          var strings = [];
          recursiveGetText(this, strings);
          return strings.join("");
        },
        set: function(newtext) {
          this.removeChildren();
          if (newtext !== null && newtext !== void 0 && newtext !== "") {
            this._appendChild(this.ownerDocument.createTextNode(newtext));
          }
        }
      },
      innerText: {
        get: function() {
          var strings = [];
          recursiveGetText(this, strings);
          return strings.join("").replace(/[ \t\n\f\r]+/g, " ").trim();
        },
        set: function(newtext) {
          this.removeChildren();
          if (newtext !== null && newtext !== void 0 && newtext !== "") {
            this._appendChild(this.ownerDocument.createTextNode(newtext));
          }
        }
      },
      innerHTML: {
        get: function() {
          return this.serialize();
        },
        set: utils.nyi
      },
      outerHTML: {
        get: function() {
          return NodeUtils.serializeOne(this, { nodeType: 0 });
        },
        set: function(v) {
          var document = this.ownerDocument;
          var parent = this.parentNode;
          if (parent === null) {
            return;
          }
          if (parent.nodeType === Node.DOCUMENT_NODE) {
            utils.NoModificationAllowedError();
          }
          if (parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            parent = parent.ownerDocument.createElement("body");
          }
          var parser = document.implementation.mozHTMLParser(
            document._address,
            parent
          );
          parser.parse(v === null ? "" : String(v), true);
          this.replaceWith(parser._asDocumentFragment());
        }
      },
      _insertAdjacent: { value: function _insertAdjacent(position, node) {
        var first = false;
        switch (position) {
          case "beforebegin":
            first = true;
          /* falls through */
          case "afterend":
            var parent = this.parentNode;
            if (parent === null) {
              return null;
            }
            return parent.insertBefore(node, first ? this : this.nextSibling);
          case "afterbegin":
            first = true;
          /* falls through */
          case "beforeend":
            return this.insertBefore(node, first ? this.firstChild : null);
          default:
            return utils.SyntaxError();
        }
      } },
      insertAdjacentElement: { value: function insertAdjacentElement(position, element) {
        if (element.nodeType !== Node.ELEMENT_NODE) {
          throw new TypeError("not an element");
        }
        position = utils.toASCIILowerCase(String(position));
        return this._insertAdjacent(position, element);
      } },
      insertAdjacentText: { value: function insertAdjacentText(position, data) {
        var textNode = this.ownerDocument.createTextNode(data);
        position = utils.toASCIILowerCase(String(position));
        this._insertAdjacent(position, textNode);
      } },
      insertAdjacentHTML: { value: function insertAdjacentHTML(position, text) {
        position = utils.toASCIILowerCase(String(position));
        text = String(text);
        var context;
        switch (position) {
          case "beforebegin":
          case "afterend":
            context = this.parentNode;
            if (context === null || context.nodeType === Node.DOCUMENT_NODE) {
              utils.NoModificationAllowedError();
            }
            break;
          case "afterbegin":
          case "beforeend":
            context = this;
            break;
          default:
            utils.SyntaxError();
        }
        if (!(context instanceof Element) || context.ownerDocument.isHTML && context.localName === "html" && context.namespaceURI === NAMESPACE.HTML) {
          context = context.ownerDocument.createElementNS(NAMESPACE.HTML, "body");
        }
        var parser = this.ownerDocument.implementation.mozHTMLParser(
          this.ownerDocument._address,
          context
        );
        parser.parse(text, true);
        this._insertAdjacent(position, parser._asDocumentFragment());
      } },
      children: { get: function() {
        if (!this._children) {
          this._children = new ChildrenCollection(this);
        }
        return this._children;
      } },
      attributes: { get: function() {
        if (!this._attributes) {
          this._attributes = new AttributesArray(this);
        }
        return this._attributes;
      } },
      firstElementChild: { get: function() {
        for (var kid = this.firstChild; kid !== null; kid = kid.nextSibling) {
          if (kid.nodeType === Node.ELEMENT_NODE) return kid;
        }
        return null;
      } },
      lastElementChild: { get: function() {
        for (var kid = this.lastChild; kid !== null; kid = kid.previousSibling) {
          if (kid.nodeType === Node.ELEMENT_NODE) return kid;
        }
        return null;
      } },
      childElementCount: { get: function() {
        return this.children.length;
      } },
      // Return the next element, in source order, after this one or
      // null if there are no more.  If root element is specified,
      // then don't traverse beyond its subtree.
      //
      // This is not a DOM method, but is convenient for
      // lazy traversals of the tree.
      nextElement: { value: function(root) {
        if (!root) root = this.ownerDocument.documentElement;
        var next = this.firstElementChild;
        if (!next) {
          if (this === root) return null;
          next = this.nextElementSibling;
        }
        if (next) return next;
        for (var parent = this.parentElement; parent && parent !== root; parent = parent.parentElement) {
          next = parent.nextElementSibling;
          if (next) return next;
        }
        return null;
      } },
      // XXX:
      // Tests are currently failing for this function.
      // Awaiting resolution of:
      // http://lists.w3.org/Archives/Public/www-dom/2011JulSep/0016.html
      getElementsByTagName: { value: function getElementsByTagName(lname) {
        var filter;
        if (!lname) return new NodeList();
        if (lname === "*")
          filter = function() {
            return true;
          };
        else if (this.isHTML)
          filter = htmlLocalNameElementFilter(lname);
        else
          filter = localNameElementFilter(lname);
        return new FilteredElementList(this, filter);
      } },
      getElementsByTagNameNS: { value: function getElementsByTagNameNS(ns, lname) {
        var filter;
        if (ns === "*" && lname === "*")
          filter = function() {
            return true;
          };
        else if (ns === "*")
          filter = localNameElementFilter(lname);
        else if (lname === "*")
          filter = namespaceElementFilter(ns);
        else
          filter = namespaceLocalNameElementFilter(ns, lname);
        return new FilteredElementList(this, filter);
      } },
      getElementsByClassName: { value: function getElementsByClassName(names) {
        names = String(names).trim();
        if (names === "") {
          var result = new NodeList();
          return result;
        }
        names = names.split(/[ \t\r\n\f]+/);
        return new FilteredElementList(this, classNamesElementFilter(names));
      } },
      getElementsByName: { value: function getElementsByName(name) {
        return new FilteredElementList(this, elementNameFilter(String(name)));
      } },
      // Utility methods used by the public API methods above
      clone: { value: function clone() {
        var e;
        if (this.namespaceURI !== NAMESPACE.HTML || this.prefix || !this.ownerDocument.isHTML) {
          e = this.ownerDocument.createElementNS(
            this.namespaceURI,
            this.prefix !== null ? this.prefix + ":" + this.localName : this.localName
          );
        } else {
          e = this.ownerDocument.createElement(this.localName);
        }
        for (var i = 0, n = this._attrKeys.length; i < n; i++) {
          var lname = this._attrKeys[i];
          var a = this._attrsByLName[lname];
          var b = a.cloneNode();
          b._setOwnerElement(e);
          e._attrsByLName[lname] = b;
          e._addQName(b);
        }
        e._attrKeys = this._attrKeys.concat();
        return e;
      } },
      isEqual: { value: function isEqual(that) {
        if (this.localName !== that.localName || this.namespaceURI !== that.namespaceURI || this.prefix !== that.prefix || this._numattrs !== that._numattrs)
          return false;
        for (var i = 0, n = this._numattrs; i < n; i++) {
          var a = this._attr(i);
          if (!that.hasAttributeNS(a.namespaceURI, a.localName))
            return false;
          if (that.getAttributeNS(a.namespaceURI, a.localName) !== a.value)
            return false;
        }
        return true;
      } },
      // This is the 'locate a namespace prefix' algorithm from the
      // DOM specification.  It is used by Node.lookupPrefix()
      // (Be sure to compare DOM3 and DOM4 versions of spec.)
      _lookupNamespacePrefix: { value: function _lookupNamespacePrefix(ns, originalElement) {
        if (this.namespaceURI && this.namespaceURI === ns && this.prefix !== null && originalElement.lookupNamespaceURI(this.prefix) === ns) {
          return this.prefix;
        }
        for (var i = 0, n = this._numattrs; i < n; i++) {
          var a = this._attr(i);
          if (a.prefix === "xmlns" && a.value === ns && originalElement.lookupNamespaceURI(a.localName) === ns) {
            return a.localName;
          }
        }
        var parent = this.parentElement;
        return parent ? parent._lookupNamespacePrefix(ns, originalElement) : null;
      } },
      // This is the 'locate a namespace' algorithm for Element nodes
      // from the DOM Core spec.  It is used by Node#lookupNamespaceURI()
      lookupNamespaceURI: { value: function lookupNamespaceURI(prefix) {
        if (prefix === "" || prefix === void 0) {
          prefix = null;
        }
        if (this.namespaceURI !== null && this.prefix === prefix)
          return this.namespaceURI;
        for (var i = 0, n = this._numattrs; i < n; i++) {
          var a = this._attr(i);
          if (a.namespaceURI === NAMESPACE.XMLNS) {
            if (a.prefix === "xmlns" && a.localName === prefix || prefix === null && a.prefix === null && a.localName === "xmlns") {
              return a.value || null;
            }
          }
        }
        var parent = this.parentElement;
        return parent ? parent.lookupNamespaceURI(prefix) : null;
      } },
      //
      // Attribute handling methods and utilities
      //
      /*
       * Attributes in the DOM are tricky:
       *
       * - there are the 8 basic get/set/has/removeAttribute{NS} methods
       *
       * - but many HTML attributes are also 'reflected' through IDL
       *   attributes which means that they can be queried and set through
       *   regular properties of the element.  There is just one attribute
       *   value, but two ways to get and set it.
       *
       * - Different HTML element types have different sets of reflected
         attributes.
       *
       * - attributes can also be queried and set through the .attributes
       *   property of an element.  This property behaves like an array of
       *   Attr objects.  The value property of each Attr is writeable, so
       *   this is a third way to read and write attributes.
       *
       * - for efficiency, we really want to store attributes in some kind
       *   of name->attr map.  But the attributes[] array is an array, not a
       *   map, which is kind of unnatural.
       *
       * - When using namespaces and prefixes, and mixing the NS methods
       *   with the non-NS methods, it is apparently actually possible for
       *   an attributes[] array to have more than one attribute with the
       *   same qualified name.  And certain methods must operate on only
       *   the first attribute with such a name.  So for these methods, an
       *   inefficient array-like data structure would be easier to
       *   implement.
       *
       * - The attributes[] array is live, not a snapshot, so changes to the
       *   attributes must be immediately visible through existing arrays.
       *
       * - When attributes are queried and set through IDL properties
       *   (instead of the get/setAttributes() method or the attributes[]
       *   array) they may be subject to type conversions, URL
       *   normalization, etc., so some extra processing is required in that
       *   case.
       *
       * - But access through IDL properties is probably the most common
       *   case, so we'd like that to be as fast as possible.
       *
       * - We can't just store attribute values in their parsed idl form,
       *   because setAttribute() has to return whatever string is passed to
       *   getAttribute even if it is not a legal, parseable value. So
       *   attribute values must be stored in unparsed string form.
       *
       * - We need to be able to send change notifications or mutation
       *   events of some sort to the renderer whenever an attribute value
       *   changes, regardless of the way in which it changes.
       *
       * - Some attributes, such as id and class affect other parts of the
       *   DOM API, like getElementById and getElementsByClassName and so
       *   for efficiency, we need to specially track changes to these
       *   special attributes.
       *
       * - Some attributes like class have different names (className) when
       *   reflected.
       *
       * - Attributes whose names begin with the string 'data-' are treated
         specially.
       *
       * - Reflected attributes that have a boolean type in IDL have special
       *   behavior: setting them to false (in IDL) is the same as removing
       *   them with removeAttribute()
       *
       * - numeric attributes (like HTMLElement.tabIndex) can have default
       *   values that must be returned by the idl getter even if the
       *   content attribute does not exist. (The default tabIndex value
       *   actually varies based on the type of the element, so that is a
       *   tricky one).
       *
       * See
       * http://www.whatwg.org/specs/web-apps/current-work/multipage/urls.html#reflect
       * for rules on how attributes are reflected.
       *
       */
      getAttribute: { value: function getAttribute(qname) {
        var attr = this.getAttributeNode(qname);
        return attr ? attr.value : null;
      } },
      getAttributeNS: { value: function getAttributeNS(ns, lname) {
        var attr = this.getAttributeNodeNS(ns, lname);
        return attr ? attr.value : null;
      } },
      getAttributeNode: { value: function getAttributeNode(qname) {
        qname = String(qname);
        if (/[A-Z]/.test(qname) && this.isHTML)
          qname = utils.toASCIILowerCase(qname);
        var attr = this._attrsByQName[qname];
        if (!attr) return null;
        if (Array.isArray(attr))
          attr = attr[0];
        return attr;
      } },
      getAttributeNodeNS: { value: function getAttributeNodeNS(ns, lname) {
        ns = ns === void 0 || ns === null ? "" : String(ns);
        lname = String(lname);
        var attr = this._attrsByLName[ns + "|" + lname];
        return attr ? attr : null;
      } },
      hasAttribute: { value: function hasAttribute(qname) {
        qname = String(qname);
        if (/[A-Z]/.test(qname) && this.isHTML)
          qname = utils.toASCIILowerCase(qname);
        return this._attrsByQName[qname] !== void 0;
      } },
      hasAttributeNS: { value: function hasAttributeNS(ns, lname) {
        ns = ns === void 0 || ns === null ? "" : String(ns);
        lname = String(lname);
        var key = ns + "|" + lname;
        return this._attrsByLName[key] !== void 0;
      } },
      hasAttributes: { value: function hasAttributes() {
        return this._numattrs > 0;
      } },
      toggleAttribute: { value: function toggleAttribute(qname, force) {
        qname = String(qname);
        if (!xml.isValidName(qname)) utils.InvalidCharacterError();
        if (/[A-Z]/.test(qname) && this.isHTML)
          qname = utils.toASCIILowerCase(qname);
        var a = this._attrsByQName[qname];
        if (a === void 0) {
          if (force === void 0 || force === true) {
            this._setAttribute(qname, "");
            return true;
          }
          return false;
        } else {
          if (force === void 0 || force === false) {
            this.removeAttribute(qname);
            return false;
          }
          return true;
        }
      } },
      // Set the attribute without error checking. The parser uses this.
      _setAttribute: { value: function _setAttribute(qname, value) {
        var attr = this._attrsByQName[qname];
        var isnew;
        if (!attr) {
          attr = this._newattr(qname);
          isnew = true;
        } else {
          if (Array.isArray(attr)) attr = attr[0];
        }
        attr.value = value;
        if (this._attributes) this._attributes[qname] = attr;
        if (isnew && this._newattrhook) this._newattrhook(qname, value);
      } },
      // Check for errors, and then set the attribute
      setAttribute: { value: function setAttribute(qname, value) {
        qname = String(qname);
        if (!xml.isValidName(qname)) utils.InvalidCharacterError();
        if (/[A-Z]/.test(qname) && this.isHTML)
          qname = utils.toASCIILowerCase(qname);
        this._setAttribute(qname, String(value));
      } },
      // The version with no error checking used by the parser
      _setAttributeNS: { value: function _setAttributeNS(ns, qname, value) {
        var pos = qname.indexOf(":"), prefix, lname;
        if (pos < 0) {
          prefix = null;
          lname = qname;
        } else {
          prefix = qname.substring(0, pos);
          lname = qname.substring(pos + 1);
        }
        if (ns === "" || ns === void 0) ns = null;
        var key = (ns === null ? "" : ns) + "|" + lname;
        var attr = this._attrsByLName[key];
        var isnew;
        if (!attr) {
          attr = new Attr(this, lname, prefix, ns);
          isnew = true;
          this._attrsByLName[key] = attr;
          if (this._attributes) {
            this._attributes[this._attrKeys.length] = attr;
          }
          this._attrKeys.push(key);
          this._addQName(attr);
        } else if (false) {
          if (attr.prefix !== prefix) {
            this._removeQName(attr);
            attr.prefix = prefix;
            this._addQName(attr);
          }
        }
        attr.value = value;
        if (isnew && this._newattrhook) this._newattrhook(qname, value);
      } },
      // Do error checking then call _setAttributeNS
      setAttributeNS: { value: function setAttributeNS(ns, qname, value) {
        ns = ns === null || ns === void 0 || ns === "" ? null : String(ns);
        qname = String(qname);
        if (!xml.isValidQName(qname)) utils.InvalidCharacterError();
        var pos = qname.indexOf(":");
        var prefix = pos < 0 ? null : qname.substring(0, pos);
        if (prefix !== null && ns === null || prefix === "xml" && ns !== NAMESPACE.XML || (qname === "xmlns" || prefix === "xmlns") && ns !== NAMESPACE.XMLNS || ns === NAMESPACE.XMLNS && !(qname === "xmlns" || prefix === "xmlns"))
          utils.NamespaceError();
        this._setAttributeNS(ns, qname, String(value));
      } },
      setAttributeNode: { value: function setAttributeNode(attr) {
        if (attr.ownerElement !== null && attr.ownerElement !== this) {
          throw new DOMException(DOMException.INUSE_ATTRIBUTE_ERR);
        }
        var result = null;
        var oldAttrs = this._attrsByQName[attr.name];
        if (oldAttrs) {
          if (!Array.isArray(oldAttrs)) {
            oldAttrs = [oldAttrs];
          }
          if (oldAttrs.some(function(a) {
            return a === attr;
          })) {
            return attr;
          } else if (attr.ownerElement !== null) {
            throw new DOMException(DOMException.INUSE_ATTRIBUTE_ERR);
          }
          oldAttrs.forEach(function(a) {
            this.removeAttributeNode(a);
          }, this);
          result = oldAttrs[0];
        }
        this.setAttributeNodeNS(attr);
        return result;
      } },
      setAttributeNodeNS: { value: function setAttributeNodeNS(attr) {
        if (attr.ownerElement !== null) {
          throw new DOMException(DOMException.INUSE_ATTRIBUTE_ERR);
        }
        var ns = attr.namespaceURI;
        var key = (ns === null ? "" : ns) + "|" + attr.localName;
        var oldAttr = this._attrsByLName[key];
        if (oldAttr) {
          this.removeAttributeNode(oldAttr);
        }
        attr._setOwnerElement(this);
        this._attrsByLName[key] = attr;
        if (this._attributes) {
          this._attributes[this._attrKeys.length] = attr;
        }
        this._attrKeys.push(key);
        this._addQName(attr);
        if (this._newattrhook) this._newattrhook(attr.name, attr.value);
        return oldAttr || null;
      } },
      removeAttribute: { value: function removeAttribute(qname) {
        qname = String(qname);
        if (/[A-Z]/.test(qname) && this.isHTML)
          qname = utils.toASCIILowerCase(qname);
        var attr = this._attrsByQName[qname];
        if (!attr) return;
        if (Array.isArray(attr)) {
          if (attr.length > 2) {
            attr = attr.shift();
          } else {
            this._attrsByQName[qname] = attr[1];
            attr = attr[0];
          }
        } else {
          this._attrsByQName[qname] = void 0;
        }
        var ns = attr.namespaceURI;
        var key = (ns === null ? "" : ns) + "|" + attr.localName;
        this._attrsByLName[key] = void 0;
        var i = this._attrKeys.indexOf(key);
        if (this._attributes) {
          Array.prototype.splice.call(this._attributes, i, 1);
          this._attributes[qname] = void 0;
        }
        this._attrKeys.splice(i, 1);
        var onchange = attr.onchange;
        attr._setOwnerElement(null);
        if (onchange) {
          onchange.call(attr, this, attr.localName, attr.value, null);
        }
        if (this.rooted) this.ownerDocument.mutateRemoveAttr(attr);
      } },
      removeAttributeNS: { value: function removeAttributeNS(ns, lname) {
        ns = ns === void 0 || ns === null ? "" : String(ns);
        lname = String(lname);
        var key = ns + "|" + lname;
        var attr = this._attrsByLName[key];
        if (!attr) return;
        this._attrsByLName[key] = void 0;
        var i = this._attrKeys.indexOf(key);
        if (this._attributes) {
          Array.prototype.splice.call(this._attributes, i, 1);
        }
        this._attrKeys.splice(i, 1);
        this._removeQName(attr);
        var onchange = attr.onchange;
        attr._setOwnerElement(null);
        if (onchange) {
          onchange.call(attr, this, attr.localName, attr.value, null);
        }
        if (this.rooted) this.ownerDocument.mutateRemoveAttr(attr);
      } },
      removeAttributeNode: { value: function removeAttributeNode(attr) {
        var ns = attr.namespaceURI;
        var key = (ns === null ? "" : ns) + "|" + attr.localName;
        if (this._attrsByLName[key] !== attr) {
          utils.NotFoundError();
        }
        this.removeAttributeNS(ns, attr.localName);
        return attr;
      } },
      getAttributeNames: { value: function getAttributeNames() {
        var elt = this;
        return this._attrKeys.map(function(key) {
          return elt._attrsByLName[key].name;
        });
      } },
      // This 'raw' version of getAttribute is used by the getter functions
      // of reflected attributes. It skips some error checking and
      // namespace steps
      _getattr: { value: function _getattr(qname) {
        var attr = this._attrsByQName[qname];
        return attr ? attr.value : null;
      } },
      // The raw version of setAttribute for reflected idl attributes.
      _setattr: { value: function _setattr(qname, value) {
        var attr = this._attrsByQName[qname];
        var isnew;
        if (!attr) {
          attr = this._newattr(qname);
          isnew = true;
        }
        attr.value = String(value);
        if (this._attributes) this._attributes[qname] = attr;
        if (isnew && this._newattrhook) this._newattrhook(qname, value);
      } },
      // Create a new Attr object, insert it, and return it.
      // Used by setAttribute() and by set()
      _newattr: { value: function _newattr(qname) {
        var attr = new Attr(this, qname, null, null);
        var key = "|" + qname;
        this._attrsByQName[qname] = attr;
        this._attrsByLName[key] = attr;
        if (this._attributes) {
          this._attributes[this._attrKeys.length] = attr;
        }
        this._attrKeys.push(key);
        return attr;
      } },
      // Add a qname->Attr mapping to the _attrsByQName object, taking into
      // account that there may be more than one attr object with the
      // same qname
      _addQName: { value: function(attr) {
        var qname = attr.name;
        var existing = this._attrsByQName[qname];
        if (!existing) {
          this._attrsByQName[qname] = attr;
        } else if (Array.isArray(existing)) {
          existing.push(attr);
        } else {
          this._attrsByQName[qname] = [existing, attr];
        }
        if (this._attributes) this._attributes[qname] = attr;
      } },
      // Remove a qname->Attr mapping to the _attrsByQName object, taking into
      // account that there may be more than one attr object with the
      // same qname
      _removeQName: { value: function(attr) {
        var qname = attr.name;
        var target = this._attrsByQName[qname];
        if (Array.isArray(target)) {
          var idx = target.indexOf(attr);
          utils.assert(idx !== -1);
          if (target.length === 2) {
            this._attrsByQName[qname] = target[1 - idx];
            if (this._attributes) {
              this._attributes[qname] = this._attrsByQName[qname];
            }
          } else {
            target.splice(idx, 1);
            if (this._attributes && this._attributes[qname] === attr) {
              this._attributes[qname] = target[0];
            }
          }
        } else {
          utils.assert(target === attr);
          this._attrsByQName[qname] = void 0;
          if (this._attributes) {
            this._attributes[qname] = void 0;
          }
        }
      } },
      // Return the number of attributes
      _numattrs: { get: function() {
        return this._attrKeys.length;
      } },
      // Return the nth Attr object
      _attr: { value: function(n) {
        return this._attrsByLName[this._attrKeys[n]];
      } },
      // Define getters and setters for an 'id' property that reflects
      // the content attribute 'id'.
      id: attributes.property({ name: "id" }),
      // Define getters and setters for a 'className' property that reflects
      // the content attribute 'class'.
      className: attributes.property({ name: "class" }),
      classList: { get: function() {
        var self = this;
        if (this._classList) {
          return this._classList;
        }
        var dtlist = new DOMTokenList(
          function() {
            return self.className || "";
          },
          function(v) {
            self.className = v;
          }
        );
        this._classList = dtlist;
        return dtlist;
      }, set: function(v) {
        this.className = v;
      } },
      matches: { value: function(selector) {
        return select.matches(this, selector);
      } },
      closest: { value: function(selector) {
        var el = this;
        do {
          if (el.matches && el.matches(selector)) {
            return el;
          }
          el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === Node.ELEMENT_NODE);
        return null;
      } },
      querySelector: { value: function(selector) {
        return select(selector, this)[0];
      } },
      querySelectorAll: { value: function(selector) {
        var nodes = select(selector, this);
        return nodes.item ? nodes : new NodeList(nodes);
      } }
    });
    Object.defineProperties(Element.prototype, ChildNode);
    Object.defineProperties(Element.prototype, NonDocumentTypeChildNode);
    attributes.registerChangeHandler(
      Element,
      "id",
      function(element, lname, oldval, newval) {
        if (element.rooted) {
          if (oldval) {
            element.ownerDocument.delId(oldval, element);
          }
          if (newval) {
            element.ownerDocument.addId(newval, element);
          }
        }
      }
    );
    attributes.registerChangeHandler(
      Element,
      "class",
      function(element, lname, oldval, newval) {
        if (element._classList) {
          element._classList._update();
        }
      }
    );
    function Attr(elt, lname, prefix, namespace, value) {
      this.localName = lname;
      this.prefix = prefix === null || prefix === "" ? null : "" + prefix;
      this.namespaceURI = namespace === null || namespace === "" ? null : "" + namespace;
      this.data = value;
      this._setOwnerElement(elt);
    }
    Attr.prototype = Object.create(Object.prototype, {
      ownerElement: {
        get: function() {
          return this._ownerElement;
        }
      },
      _setOwnerElement: { value: function _setOwnerElement(elt) {
        this._ownerElement = elt;
        if (this.prefix === null && this.namespaceURI === null && elt) {
          this.onchange = elt._attributeChangeHandlers[this.localName];
        } else {
          this.onchange = null;
        }
      } },
      name: { get: function() {
        return this.prefix ? this.prefix + ":" + this.localName : this.localName;
      } },
      specified: { get: function() {
        return true;
      } },
      value: {
        get: function() {
          return this.data;
        },
        set: function(value) {
          var oldval = this.data;
          value = value === void 0 ? "" : value + "";
          if (value === oldval) return;
          this.data = value;
          if (this.ownerElement) {
            if (this.onchange)
              this.onchange(this.ownerElement, this.localName, oldval, value);
            if (this.ownerElement.rooted)
              this.ownerElement.ownerDocument.mutateAttr(this, oldval);
          }
        }
      },
      cloneNode: { value: function cloneNode(deep) {
        return new Attr(
          null,
          this.localName,
          this.prefix,
          this.namespaceURI,
          this.data
        );
      } },
      // Legacy aliases (see gh#70 and https://dom.spec.whatwg.org/#interface-attr)
      nodeType: { get: function() {
        return Node.ATTRIBUTE_NODE;
      } },
      nodeName: { get: function() {
        return this.name;
      } },
      nodeValue: {
        get: function() {
          return this.value;
        },
        set: function(v) {
          this.value = v;
        }
      },
      textContent: {
        get: function() {
          return this.value;
        },
        set: function(v) {
          if (v === null || v === void 0) {
            v = "";
          }
          this.value = v;
        }
      },
      innerText: {
        get: function() {
          return this.value;
        },
        set: function(v) {
          if (v === null || v === void 0) {
            v = "";
          }
          this.value = v;
        }
      }
    });
    Element._Attr = Attr;
    function AttributesArray(elt) {
      NamedNodeMap.call(this, elt);
      for (var name in elt._attrsByQName) {
        this[name] = elt._attrsByQName[name];
      }
      for (var i = 0; i < elt._attrKeys.length; i++) {
        this[i] = elt._attrsByLName[elt._attrKeys[i]];
      }
    }
    AttributesArray.prototype = Object.create(NamedNodeMap.prototype, {
      length: { get: function() {
        return this.element._attrKeys.length;
      }, set: function() {
      } },
      item: { value: function(n) {
        n = n >>> 0;
        if (n >= this.length) {
          return null;
        }
        return this.element._attrsByLName[this.element._attrKeys[n]];
      } }
    });
    if (globalThis.Symbol?.iterator) {
      AttributesArray.prototype[globalThis.Symbol.iterator] = function() {
        var i = 0, n = this.length, self = this;
        return {
          next: function() {
            if (i < n) return { value: self.item(i++) };
            return { done: true };
          }
        };
      };
    }
    function ChildrenCollection(e) {
      this.element = e;
      this.updateCache();
    }
    ChildrenCollection.prototype = Object.create(Object.prototype, {
      length: { get: function() {
        this.updateCache();
        return this.childrenByNumber.length;
      } },
      item: { value: function item(n) {
        this.updateCache();
        return this.childrenByNumber[n] || null;
      } },
      namedItem: { value: function namedItem(name) {
        this.updateCache();
        return this.childrenByName[name] || null;
      } },
      // This attribute returns the entire name->element map.
      // It is not part of the HTMLCollection API, but we need it in
      // src/HTMLCollectionProxy
      namedItems: { get: function() {
        this.updateCache();
        return this.childrenByName;
      } },
      updateCache: { value: function updateCache() {
        var namedElts = /^(a|applet|area|embed|form|frame|frameset|iframe|img|object)$/;
        if (this.lastModTime !== this.element.lastModTime) {
          this.lastModTime = this.element.lastModTime;
          var n = this.childrenByNumber && this.childrenByNumber.length || 0;
          for (var i = 0; i < n; i++) {
            this[i] = void 0;
          }
          this.childrenByNumber = [];
          this.childrenByName = /* @__PURE__ */ Object.create(null);
          for (var c = this.element.firstChild; c !== null; c = c.nextSibling) {
            if (c.nodeType === Node.ELEMENT_NODE) {
              this[this.childrenByNumber.length] = c;
              this.childrenByNumber.push(c);
              var id = c.getAttribute("id");
              if (id && !this.childrenByName[id])
                this.childrenByName[id] = c;
              var name = c.getAttribute("name");
              if (name && this.element.namespaceURI === NAMESPACE.HTML && namedElts.test(this.element.localName) && !this.childrenByName[name])
                this.childrenByName[id] = c;
            }
          }
        }
      } }
    });
    function localNameElementFilter(lname) {
      return function(e) {
        return e.localName === lname;
      };
    }
    function htmlLocalNameElementFilter(lname) {
      var lclname = utils.toASCIILowerCase(lname);
      if (lclname === lname)
        return localNameElementFilter(lname);
      return function(e) {
        return e.isHTML ? e.localName === lclname : e.localName === lname;
      };
    }
    function namespaceElementFilter(ns) {
      return function(e) {
        return e.namespaceURI === ns;
      };
    }
    function namespaceLocalNameElementFilter(ns, lname) {
      return function(e) {
        return e.namespaceURI === ns && e.localName === lname;
      };
    }
    function classNamesElementFilter(names) {
      return function(e) {
        return names.every(function(n) {
          return e.classList.contains(n);
        });
      };
    }
    function elementNameFilter(name) {
      return function(e) {
        if (e.namespaceURI !== NAMESPACE.HTML) {
          return false;
        }
        return e.getAttribute("name") === name;
      };
    }
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Leaf.js
var require_Leaf = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Leaf.js"(exports2, module2) {
    "use strict";
    module2.exports = Leaf;
    var Node = require_Node();
    var NodeList = require_NodeList();
    var utils = require_utils();
    var HierarchyRequestError = utils.HierarchyRequestError;
    var NotFoundError = utils.NotFoundError;
    function Leaf() {
      Node.call(this);
    }
    Leaf.prototype = Object.create(Node.prototype, {
      hasChildNodes: { value: function() {
        return false;
      } },
      firstChild: { value: null },
      lastChild: { value: null },
      insertBefore: { value: function(node, child) {
        if (!node.nodeType) throw new TypeError("not a node");
        HierarchyRequestError();
      } },
      replaceChild: { value: function(node, child) {
        if (!node.nodeType) throw new TypeError("not a node");
        HierarchyRequestError();
      } },
      removeChild: { value: function(node) {
        if (!node.nodeType) throw new TypeError("not a node");
        NotFoundError();
      } },
      removeChildren: { value: function() {
      } },
      childNodes: { get: function() {
        if (!this._childNodes) this._childNodes = new NodeList();
        return this._childNodes;
      } }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/CharacterData.js
var require_CharacterData = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/CharacterData.js"(exports2, module2) {
    "use strict";
    module2.exports = CharacterData;
    var Leaf = require_Leaf();
    var utils = require_utils();
    var ChildNode = require_ChildNode();
    var NonDocumentTypeChildNode = require_NonDocumentTypeChildNode();
    function CharacterData() {
      Leaf.call(this);
    }
    CharacterData.prototype = Object.create(Leaf.prototype, {
      // DOMString substringData(unsigned long offset,
      //               unsigned long count);
      // The substringData(offset, count) method must run these steps:
      //
      //     If offset is greater than the context object's
      //     length, throw an INDEX_SIZE_ERR exception and
      //     terminate these steps.
      //
      //     If offset+count is greater than the context
      //     object's length, return a DOMString whose value is
      //     the UTF-16 code units from the offsetth UTF-16 code
      //     unit to the end of data.
      //
      //     Return a DOMString whose value is the UTF-16 code
      //     units from the offsetth UTF-16 code unit to the
      //     offset+countth UTF-16 code unit in data.
      substringData: { value: function substringData(offset, count) {
        if (arguments.length < 2) {
          throw new TypeError("Not enough arguments");
        }
        offset = offset >>> 0;
        count = count >>> 0;
        if (offset > this.data.length || offset < 0 || count < 0) {
          utils.IndexSizeError();
        }
        return this.data.substring(offset, offset + count);
      } },
      // void appendData(DOMString data);
      // The appendData(data) method must append data to the context
      // object's data.
      appendData: { value: function appendData(data) {
        if (arguments.length < 1) {
          throw new TypeError("Not enough arguments");
        }
        this.data += String(data);
      } },
      // void insertData(unsigned long offset, DOMString data);
      // The insertData(offset, data) method must run these steps:
      //
      //     If offset is greater than the context object's
      //     length, throw an INDEX_SIZE_ERR exception and
      //     terminate these steps.
      //
      //     Insert data into the context object's data after
      //     offset UTF-16 code units.
      //
      insertData: { value: function insertData(offset, data) {
        return this.replaceData(offset, 0, data);
      } },
      // void deleteData(unsigned long offset, unsigned long count);
      // The deleteData(offset, count) method must run these steps:
      //
      //     If offset is greater than the context object's
      //     length, throw an INDEX_SIZE_ERR exception and
      //     terminate these steps.
      //
      //     If offset+count is greater than the context
      //     object's length var count be length-offset.
      //
      //     Starting from offset UTF-16 code units remove count
      //     UTF-16 code units from the context object's data.
      deleteData: { value: function deleteData(offset, count) {
        return this.replaceData(offset, count, "");
      } },
      // void replaceData(unsigned long offset, unsigned long count,
      //          DOMString data);
      //
      // The replaceData(offset, count, data) method must act as
      // if the deleteData() method is invoked with offset and
      // count as arguments followed by the insertData() method
      // with offset and data as arguments and re-throw any
      // exceptions these methods might have thrown.
      replaceData: { value: function replaceData(offset, count, data) {
        var curtext = this.data, len = curtext.length;
        offset = offset >>> 0;
        count = count >>> 0;
        data = String(data);
        if (offset > len || offset < 0) utils.IndexSizeError();
        if (offset + count > len)
          count = len - offset;
        var prefix = curtext.substring(0, offset), suffix = curtext.substring(offset + count);
        this.data = prefix + data + suffix;
      } },
      // Utility method that Node.isEqualNode() calls to test Text and
      // Comment nodes for equality.  It is okay to put it here, since
      // Node will have already verified that nodeType is equal
      isEqual: { value: function isEqual(n) {
        return this._data === n._data;
      } },
      length: { get: function() {
        return this.data.length;
      } }
    });
    Object.defineProperties(CharacterData.prototype, ChildNode);
    Object.defineProperties(CharacterData.prototype, NonDocumentTypeChildNode);
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Text.js
var require_Text = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Text.js"(exports2, module2) {
    "use strict";
    module2.exports = Text;
    var utils = require_utils();
    var Node = require_Node();
    var CharacterData = require_CharacterData();
    function Text(doc, data) {
      CharacterData.call(this);
      this.nodeType = Node.TEXT_NODE;
      this.ownerDocument = doc;
      this._data = data;
      this._index = void 0;
    }
    var nodeValue = {
      get: function() {
        return this._data;
      },
      set: function(v) {
        if (v === null || v === void 0) {
          v = "";
        } else {
          v = String(v);
        }
        if (v === this._data) return;
        this._data = v;
        if (this.rooted)
          this.ownerDocument.mutateValue(this);
        if (this.parentNode && this.parentNode._textchangehook)
          this.parentNode._textchangehook(this);
      }
    };
    Text.prototype = Object.create(CharacterData.prototype, {
      nodeName: { value: "#text" },
      // These three attributes are all the same.
      // The data attribute has a [TreatNullAs=EmptyString] but we'll
      // implement that at the interface level
      nodeValue,
      textContent: nodeValue,
      innerText: nodeValue,
      data: {
        get: nodeValue.get,
        set: function(v) {
          nodeValue.set.call(this, v === null ? "" : String(v));
        }
      },
      splitText: { value: function splitText(offset) {
        if (offset > this._data.length || offset < 0) utils.IndexSizeError();
        var newdata = this._data.substring(offset), newnode = this.ownerDocument.createTextNode(newdata);
        this.data = this.data.substring(0, offset);
        var parent = this.parentNode;
        if (parent !== null)
          parent.insertBefore(newnode, this.nextSibling);
        return newnode;
      } },
      wholeText: { get: function wholeText() {
        var result = this.textContent;
        for (var next = this.nextSibling; next; next = next.nextSibling) {
          if (next.nodeType !== Node.TEXT_NODE) {
            break;
          }
          result += next.textContent;
        }
        return result;
      } },
      // Obsolete, removed from spec.
      replaceWholeText: { value: utils.nyi },
      // Utility methods
      clone: { value: function clone() {
        return new Text(this.ownerDocument, this._data);
      } }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Comment.js
var require_Comment = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Comment.js"(exports2, module2) {
    "use strict";
    module2.exports = Comment;
    var Node = require_Node();
    var CharacterData = require_CharacterData();
    function Comment(doc, data) {
      CharacterData.call(this);
      this.nodeType = Node.COMMENT_NODE;
      this.ownerDocument = doc;
      this._data = data;
    }
    var nodeValue = {
      get: function() {
        return this._data;
      },
      set: function(v) {
        if (v === null || v === void 0) {
          v = "";
        } else {
          v = String(v);
        }
        this._data = v;
        if (this.rooted)
          this.ownerDocument.mutateValue(this);
      }
    };
    Comment.prototype = Object.create(CharacterData.prototype, {
      nodeName: { value: "#comment" },
      nodeValue,
      textContent: nodeValue,
      innerText: nodeValue,
      data: {
        get: nodeValue.get,
        set: function(v) {
          nodeValue.set.call(this, v === null ? "" : String(v));
        }
      },
      // Utility methods
      clone: { value: function clone() {
        return new Comment(this.ownerDocument, this._data);
      } }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/DocumentFragment.js
var require_DocumentFragment = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/DocumentFragment.js"(exports2, module2) {
    "use strict";
    module2.exports = DocumentFragment;
    var Node = require_Node();
    var NodeList = require_NodeList();
    var ContainerNode = require_ContainerNode();
    var Element = require_Element();
    var select = require_select();
    var utils = require_utils();
    function DocumentFragment(doc) {
      ContainerNode.call(this);
      this.nodeType = Node.DOCUMENT_FRAGMENT_NODE;
      this.ownerDocument = doc;
    }
    DocumentFragment.prototype = Object.create(ContainerNode.prototype, {
      nodeName: { value: "#document-fragment" },
      nodeValue: {
        get: function() {
          return null;
        },
        set: function() {
        }
      },
      // Copy the text content getter/setter from Element
      textContent: Object.getOwnPropertyDescriptor(Element.prototype, "textContent"),
      // Copy the text content getter/setter from Element
      innerText: Object.getOwnPropertyDescriptor(Element.prototype, "innerText"),
      querySelector: { value: function(selector) {
        var nodes = this.querySelectorAll(selector);
        return nodes.length ? nodes[0] : null;
      } },
      querySelectorAll: { value: function(selector) {
        var context = Object.create(this);
        context.isHTML = true;
        context.getElementsByTagName = Element.prototype.getElementsByTagName;
        context.nextElement = Object.getOwnPropertyDescriptor(Element.prototype, "firstElementChild").get;
        var nodes = select(selector, context);
        return nodes.item ? nodes : new NodeList(nodes);
      } },
      // Utility methods
      clone: { value: function clone() {
        return new DocumentFragment(this.ownerDocument);
      } },
      isEqual: { value: function isEqual(n) {
        return true;
      } },
      // Non-standard, but useful (github issue #73)
      innerHTML: {
        get: function() {
          return this.serialize();
        },
        set: utils.nyi
      },
      outerHTML: {
        get: function() {
          return this.serialize();
        },
        set: utils.nyi
      }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/ProcessingInstruction.js
var require_ProcessingInstruction = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/ProcessingInstruction.js"(exports2, module2) {
    "use strict";
    module2.exports = ProcessingInstruction;
    var Node = require_Node();
    var CharacterData = require_CharacterData();
    function ProcessingInstruction(doc, target, data) {
      CharacterData.call(this);
      this.nodeType = Node.PROCESSING_INSTRUCTION_NODE;
      this.ownerDocument = doc;
      this.target = target;
      this._data = data;
    }
    var nodeValue = {
      get: function() {
        return this._data;
      },
      set: function(v) {
        if (v === null || v === void 0) {
          v = "";
        } else {
          v = String(v);
        }
        this._data = v;
        if (this.rooted) this.ownerDocument.mutateValue(this);
      }
    };
    ProcessingInstruction.prototype = Object.create(CharacterData.prototype, {
      nodeName: { get: function() {
        return this.target;
      } },
      nodeValue,
      textContent: nodeValue,
      innerText: nodeValue,
      data: {
        get: nodeValue.get,
        set: function(v) {
          nodeValue.set.call(this, v === null ? "" : String(v));
        }
      },
      // Utility methods
      clone: { value: function clone() {
        return new ProcessingInstruction(this.ownerDocument, this.target, this._data);
      } },
      isEqual: { value: function isEqual(n) {
        return this.target === n.target && this._data === n._data;
      } }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NodeFilter.js
var require_NodeFilter = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NodeFilter.js"(exports2, module2) {
    "use strict";
    var NodeFilter = {
      // Constants for acceptNode()
      FILTER_ACCEPT: 1,
      FILTER_REJECT: 2,
      FILTER_SKIP: 3,
      // Constants for whatToShow
      SHOW_ALL: 4294967295,
      SHOW_ELEMENT: 1,
      SHOW_ATTRIBUTE: 2,
      // historical
      SHOW_TEXT: 4,
      SHOW_CDATA_SECTION: 8,
      // historical
      SHOW_ENTITY_REFERENCE: 16,
      // historical
      SHOW_ENTITY: 32,
      // historical
      SHOW_PROCESSING_INSTRUCTION: 64,
      SHOW_COMMENT: 128,
      SHOW_DOCUMENT: 256,
      SHOW_DOCUMENT_TYPE: 512,
      SHOW_DOCUMENT_FRAGMENT: 1024,
      SHOW_NOTATION: 2048
      // historical
    };
    module2.exports = NodeFilter.constructor = NodeFilter.prototype = NodeFilter;
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NodeTraversal.js
var require_NodeTraversal = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NodeTraversal.js"(exports2, module2) {
    "use strict";
    var NodeTraversal = module2.exports = {
      nextSkippingChildren,
      nextAncestorSibling,
      next,
      previous,
      deepLastChild
    };
    function nextSkippingChildren(node, stayWithin) {
      if (node === stayWithin) {
        return null;
      }
      if (node.nextSibling !== null) {
        return node.nextSibling;
      }
      return nextAncestorSibling(node, stayWithin);
    }
    function nextAncestorSibling(node, stayWithin) {
      for (node = node.parentNode; node !== null; node = node.parentNode) {
        if (node === stayWithin) {
          return null;
        }
        if (node.nextSibling !== null) {
          return node.nextSibling;
        }
      }
      return null;
    }
    function next(node, stayWithin) {
      var n;
      n = node.firstChild;
      if (n !== null) {
        return n;
      }
      if (node === stayWithin) {
        return null;
      }
      n = node.nextSibling;
      if (n !== null) {
        return n;
      }
      return nextAncestorSibling(node, stayWithin);
    }
    function deepLastChild(node) {
      while (node.lastChild) {
        node = node.lastChild;
      }
      return node;
    }
    function previous(node, stayWithin) {
      var p;
      p = node.previousSibling;
      if (p !== null) {
        return deepLastChild(p);
      }
      p = node.parentNode;
      if (p === stayWithin) {
        return null;
      }
      return p;
    }
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/TreeWalker.js
var require_TreeWalker = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/TreeWalker.js"(exports2, module2) {
    "use strict";
    module2.exports = TreeWalker;
    var Node = require_Node();
    var NodeFilter = require_NodeFilter();
    var NodeTraversal = require_NodeTraversal();
    var utils = require_utils();
    var mapChild = {
      first: "firstChild",
      last: "lastChild",
      next: "firstChild",
      previous: "lastChild"
    };
    var mapSibling = {
      first: "nextSibling",
      last: "previousSibling",
      next: "nextSibling",
      previous: "previousSibling"
    };
    function traverseChildren(tw, type) {
      var child, node, parent, result, sibling;
      node = tw._currentNode[mapChild[type]];
      while (node !== null) {
        result = tw._internalFilter(node);
        if (result === NodeFilter.FILTER_ACCEPT) {
          tw._currentNode = node;
          return node;
        }
        if (result === NodeFilter.FILTER_SKIP) {
          child = node[mapChild[type]];
          if (child !== null) {
            node = child;
            continue;
          }
        }
        while (node !== null) {
          sibling = node[mapSibling[type]];
          if (sibling !== null) {
            node = sibling;
            break;
          }
          parent = node.parentNode;
          if (parent === null || parent === tw.root || parent === tw._currentNode) {
            return null;
          } else {
            node = parent;
          }
        }
      }
      return null;
    }
    function traverseSiblings(tw, type) {
      var node, result, sibling;
      node = tw._currentNode;
      if (node === tw.root) {
        return null;
      }
      while (true) {
        sibling = node[mapSibling[type]];
        while (sibling !== null) {
          node = sibling;
          result = tw._internalFilter(node);
          if (result === NodeFilter.FILTER_ACCEPT) {
            tw._currentNode = node;
            return node;
          }
          sibling = node[mapChild[type]];
          if (result === NodeFilter.FILTER_REJECT || sibling === null) {
            sibling = node[mapSibling[type]];
          }
        }
        node = node.parentNode;
        if (node === null || node === tw.root) {
          return null;
        }
        if (tw._internalFilter(node) === NodeFilter.FILTER_ACCEPT) {
          return null;
        }
      }
    }
    function TreeWalker(root, whatToShow, filter) {
      if (!root || !root.nodeType) {
        utils.NotSupportedError();
      }
      this._root = root;
      this._whatToShow = Number(whatToShow) || 0;
      this._filter = filter || null;
      this._active = false;
      this._currentNode = root;
    }
    Object.defineProperties(TreeWalker.prototype, {
      root: { get: function() {
        return this._root;
      } },
      whatToShow: { get: function() {
        return this._whatToShow;
      } },
      filter: { get: function() {
        return this._filter;
      } },
      currentNode: {
        get: function currentNode() {
          return this._currentNode;
        },
        set: function setCurrentNode(v) {
          if (!(v instanceof Node)) {
            throw new TypeError("Not a Node");
          }
          this._currentNode = v;
        }
      },
      /**
       * @method
       * @param {Node} node
       * @return {Number} Constant NodeFilter.FILTER_ACCEPT,
       *  NodeFilter.FILTER_REJECT or NodeFilter.FILTER_SKIP.
       */
      _internalFilter: { value: function _internalFilter(node) {
        var result, filter;
        if (this._active) {
          utils.InvalidStateError();
        }
        if (!(1 << node.nodeType - 1 & this._whatToShow)) {
          return NodeFilter.FILTER_SKIP;
        }
        filter = this._filter;
        if (filter === null) {
          result = NodeFilter.FILTER_ACCEPT;
        } else {
          this._active = true;
          try {
            if (typeof filter === "function") {
              result = filter(node);
            } else {
              result = filter.acceptNode(node);
            }
          } finally {
            this._active = false;
          }
        }
        return +result;
      } },
      /**
       * @spec https://dom.spec.whatwg.org/#dom-treewalker-parentnode
       * @based on WebKit's TreeWalker::parentNode
       * https://trac.webkit.org/browser/webkit/trunk/Source/WebCore/dom/TreeWalker.cpp?rev=220453#L50
       * @method
       * @return {Node|null}
       */
      parentNode: { value: function parentNode() {
        var node = this._currentNode;
        while (node !== this.root) {
          node = node.parentNode;
          if (node === null) {
            return null;
          }
          if (this._internalFilter(node) === NodeFilter.FILTER_ACCEPT) {
            this._currentNode = node;
            return node;
          }
        }
        return null;
      } },
      /**
       * @spec https://dom.spec.whatwg.org/#dom-treewalker-firstchild
       * @method
       * @return {Node|null}
       */
      firstChild: { value: function firstChild() {
        return traverseChildren(this, "first");
      } },
      /**
       * @spec https://dom.spec.whatwg.org/#dom-treewalker-lastchild
       * @method
       * @return {Node|null}
       */
      lastChild: { value: function lastChild() {
        return traverseChildren(this, "last");
      } },
      /**
       * @spec http://www.w3.org/TR/dom/#dom-treewalker-previoussibling
       * @method
       * @return {Node|null}
       */
      previousSibling: { value: function previousSibling() {
        return traverseSiblings(this, "previous");
      } },
      /**
       * @spec http://www.w3.org/TR/dom/#dom-treewalker-nextsibling
       * @method
       * @return {Node|null}
       */
      nextSibling: { value: function nextSibling() {
        return traverseSiblings(this, "next");
      } },
      /**
       * @spec https://dom.spec.whatwg.org/#dom-treewalker-previousnode
       * @based on WebKit's TreeWalker::previousNode
       * https://trac.webkit.org/browser/webkit/trunk/Source/WebCore/dom/TreeWalker.cpp?rev=220453#L181
       * @method
       * @return {Node|null}
       */
      previousNode: { value: function previousNode() {
        var node, result, previousSibling, lastChild;
        node = this._currentNode;
        while (node !== this._root) {
          for (previousSibling = node.previousSibling; previousSibling; previousSibling = node.previousSibling) {
            node = previousSibling;
            result = this._internalFilter(node);
            if (result === NodeFilter.FILTER_REJECT) {
              continue;
            }
            for (lastChild = node.lastChild; lastChild; lastChild = node.lastChild) {
              node = lastChild;
              result = this._internalFilter(node);
              if (result === NodeFilter.FILTER_REJECT) {
                break;
              }
            }
            if (result === NodeFilter.FILTER_ACCEPT) {
              this._currentNode = node;
              return node;
            }
          }
          if (node === this.root || node.parentNode === null) {
            return null;
          }
          node = node.parentNode;
          if (this._internalFilter(node) === NodeFilter.FILTER_ACCEPT) {
            this._currentNode = node;
            return node;
          }
        }
        return null;
      } },
      /**
       * @spec https://dom.spec.whatwg.org/#dom-treewalker-nextnode
       * @based on WebKit's TreeWalker::nextNode
       * https://trac.webkit.org/browser/webkit/trunk/Source/WebCore/dom/TreeWalker.cpp?rev=220453#L228
       * @method
       * @return {Node|null}
       */
      nextNode: { value: function nextNode() {
        var node, result, firstChild, nextSibling;
        node = this._currentNode;
        result = NodeFilter.FILTER_ACCEPT;
        CHILDREN:
          while (true) {
            for (firstChild = node.firstChild; firstChild; firstChild = node.firstChild) {
              node = firstChild;
              result = this._internalFilter(node);
              if (result === NodeFilter.FILTER_ACCEPT) {
                this._currentNode = node;
                return node;
              } else if (result === NodeFilter.FILTER_REJECT) {
                break;
              }
            }
            for (nextSibling = NodeTraversal.nextSkippingChildren(node, this.root); nextSibling; nextSibling = NodeTraversal.nextSkippingChildren(node, this.root)) {
              node = nextSibling;
              result = this._internalFilter(node);
              if (result === NodeFilter.FILTER_ACCEPT) {
                this._currentNode = node;
                return node;
              } else if (result === NodeFilter.FILTER_SKIP) {
                continue CHILDREN;
              }
            }
            return null;
          }
      } },
      /** For compatibility with web-platform-tests. */
      toString: { value: function toString() {
        return "[object TreeWalker]";
      } }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NodeIterator.js
var require_NodeIterator = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NodeIterator.js"(exports2, module2) {
    "use strict";
    module2.exports = NodeIterator;
    var NodeFilter = require_NodeFilter();
    var NodeTraversal = require_NodeTraversal();
    var utils = require_utils();
    function move(node, stayWithin, directionIsNext) {
      if (directionIsNext) {
        return NodeTraversal.next(node, stayWithin);
      } else {
        if (node === stayWithin) {
          return null;
        }
        return NodeTraversal.previous(node, null);
      }
    }
    function isInclusiveAncestor(node, possibleChild) {
      for (; possibleChild; possibleChild = possibleChild.parentNode) {
        if (node === possibleChild) {
          return true;
        }
      }
      return false;
    }
    function traverse(ni, directionIsNext) {
      var node, beforeNode;
      node = ni._referenceNode;
      beforeNode = ni._pointerBeforeReferenceNode;
      while (true) {
        if (beforeNode === directionIsNext) {
          beforeNode = !beforeNode;
        } else {
          node = move(node, ni._root, directionIsNext);
          if (node === null) {
            return null;
          }
        }
        var result = ni._internalFilter(node);
        if (result === NodeFilter.FILTER_ACCEPT) {
          break;
        }
      }
      ni._referenceNode = node;
      ni._pointerBeforeReferenceNode = beforeNode;
      return node;
    }
    function NodeIterator(root, whatToShow, filter) {
      if (!root || !root.nodeType) {
        utils.NotSupportedError();
      }
      this._root = root;
      this._referenceNode = root;
      this._pointerBeforeReferenceNode = true;
      this._whatToShow = Number(whatToShow) || 0;
      this._filter = filter || null;
      this._active = false;
      root.doc._attachNodeIterator(this);
    }
    Object.defineProperties(NodeIterator.prototype, {
      root: { get: function root() {
        return this._root;
      } },
      referenceNode: { get: function referenceNode() {
        return this._referenceNode;
      } },
      pointerBeforeReferenceNode: { get: function pointerBeforeReferenceNode() {
        return this._pointerBeforeReferenceNode;
      } },
      whatToShow: { get: function whatToShow() {
        return this._whatToShow;
      } },
      filter: { get: function filter() {
        return this._filter;
      } },
      /**
       * @method
       * @param {Node} node
       * @return {Number} Constant NodeFilter.FILTER_ACCEPT,
       *  NodeFilter.FILTER_REJECT or NodeFilter.FILTER_SKIP.
       */
      _internalFilter: { value: function _internalFilter(node) {
        var result, filter;
        if (this._active) {
          utils.InvalidStateError();
        }
        if (!(1 << node.nodeType - 1 & this._whatToShow)) {
          return NodeFilter.FILTER_SKIP;
        }
        filter = this._filter;
        if (filter === null) {
          result = NodeFilter.FILTER_ACCEPT;
        } else {
          this._active = true;
          try {
            if (typeof filter === "function") {
              result = filter(node);
            } else {
              result = filter.acceptNode(node);
            }
          } finally {
            this._active = false;
          }
        }
        return +result;
      } },
      /**
       * @spec https://dom.spec.whatwg.org/#nodeiterator-pre-removing-steps
       * @method
       * @return void
       */
      _preremove: { value: function _preremove(toBeRemovedNode) {
        if (isInclusiveAncestor(toBeRemovedNode, this._root)) {
          return;
        }
        if (!isInclusiveAncestor(toBeRemovedNode, this._referenceNode)) {
          return;
        }
        if (this._pointerBeforeReferenceNode) {
          var next = toBeRemovedNode;
          while (next.lastChild) {
            next = next.lastChild;
          }
          next = NodeTraversal.next(next, this.root);
          if (next) {
            this._referenceNode = next;
            return;
          }
          this._pointerBeforeReferenceNode = false;
        }
        if (toBeRemovedNode.previousSibling === null) {
          this._referenceNode = toBeRemovedNode.parentNode;
        } else {
          this._referenceNode = toBeRemovedNode.previousSibling;
          var lastChild;
          for (lastChild = this._referenceNode.lastChild; lastChild; lastChild = this._referenceNode.lastChild) {
            this._referenceNode = lastChild;
          }
        }
      } },
      /**
       * @spec http://www.w3.org/TR/dom/#dom-nodeiterator-nextnode
       * @method
       * @return {Node|null}
       */
      nextNode: { value: function nextNode() {
        return traverse(this, true);
      } },
      /**
       * @spec http://www.w3.org/TR/dom/#dom-nodeiterator-previousnode
       * @method
       * @return {Node|null}
       */
      previousNode: { value: function previousNode() {
        return traverse(this, false);
      } },
      /**
       * @spec http://www.w3.org/TR/dom/#dom-nodeiterator-detach
       * @method
       * @return void
       */
      detach: { value: function detach() {
      } },
      /** For compatibility with web-platform-tests. */
      toString: { value: function toString() {
        return "[object NodeIterator]";
      } }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/URL.js
var require_URL = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/URL.js"(exports2, module2) {
    "use strict";
    module2.exports = URL2;
    function URL2(url) {
      if (!url) return Object.create(URL2.prototype);
      this.url = url.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, "");
      var match = URL2.pattern.exec(this.url);
      if (match) {
        if (match[2]) this.scheme = match[2];
        if (match[4]) {
          var userinfo = match[4].match(URL2.userinfoPattern);
          if (userinfo) {
            this.username = userinfo[1];
            this.password = userinfo[3];
            match[4] = match[4].substring(userinfo[0].length);
          }
          if (match[4].match(URL2.portPattern)) {
            var pos = match[4].lastIndexOf(":");
            this.host = match[4].substring(0, pos);
            this.port = match[4].substring(pos + 1);
          } else {
            this.host = match[4];
          }
        }
        if (match[5]) this.path = match[5];
        if (match[6]) this.query = match[7];
        if (match[8]) this.fragment = match[9];
      }
    }
    URL2.pattern = /^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/;
    URL2.userinfoPattern = /^([^@:]*)(:([^@]*))?@/;
    URL2.portPattern = /:\d+$/;
    URL2.authorityPattern = /^[^:\/?#]+:\/\//;
    URL2.hierarchyPattern = /^[^:\/?#]+:\//;
    URL2.percentEncode = function percentEncode(s) {
      var c = s.charCodeAt(0);
      if (c < 256) return "%" + c.toString(16);
      else throw Error("can't percent-encode codepoints > 255 yet");
    };
    URL2.prototype = {
      constructor: URL2,
      // XXX: not sure if this is the precise definition of absolute
      isAbsolute: function() {
        return !!this.scheme;
      },
      isAuthorityBased: function() {
        return URL2.authorityPattern.test(this.url);
      },
      isHierarchical: function() {
        return URL2.hierarchyPattern.test(this.url);
      },
      toString: function() {
        var s = "";
        if (this.scheme !== void 0) s += this.scheme + ":";
        if (this.isAbsolute()) {
          s += "//";
          if (this.username || this.password) {
            s += this.username || "";
            if (this.password) {
              s += ":" + this.password;
            }
            s += "@";
          }
          if (this.host) {
            s += this.host;
          }
        }
        if (this.port !== void 0) s += ":" + this.port;
        if (this.path !== void 0) s += this.path;
        if (this.query !== void 0) s += "?" + this.query;
        if (this.fragment !== void 0) s += "#" + this.fragment;
        return s;
      },
      // See: http://tools.ietf.org/html/rfc3986#section-5.2
      // and https://url.spec.whatwg.org/#constructors
      resolve: function(relative) {
        var base = this;
        var r = new URL2(relative);
        var t = new URL2();
        if (r.scheme !== void 0) {
          t.scheme = r.scheme;
          t.username = r.username;
          t.password = r.password;
          t.host = r.host;
          t.port = r.port;
          t.path = remove_dot_segments(r.path);
          t.query = r.query;
        } else {
          t.scheme = base.scheme;
          if (r.host !== void 0) {
            t.username = r.username;
            t.password = r.password;
            t.host = r.host;
            t.port = r.port;
            t.path = remove_dot_segments(r.path);
            t.query = r.query;
          } else {
            t.username = base.username;
            t.password = base.password;
            t.host = base.host;
            t.port = base.port;
            if (!r.path) {
              t.path = base.path;
              if (r.query !== void 0)
                t.query = r.query;
              else
                t.query = base.query;
            } else {
              if (r.path.charAt(0) === "/") {
                t.path = remove_dot_segments(r.path);
              } else {
                t.path = merge(base.path, r.path);
                t.path = remove_dot_segments(t.path);
              }
              t.query = r.query;
            }
          }
        }
        t.fragment = r.fragment;
        return t.toString();
        function merge(basepath, refpath) {
          if (base.host !== void 0 && !base.path)
            return "/" + refpath;
          var lastslash = basepath.lastIndexOf("/");
          if (lastslash === -1)
            return refpath;
          else
            return basepath.substring(0, lastslash + 1) + refpath;
        }
        function remove_dot_segments(path) {
          if (!path) return path;
          var output = "";
          while (path.length > 0) {
            if (path === "." || path === "..") {
              path = "";
              break;
            }
            var twochars = path.substring(0, 2);
            var threechars = path.substring(0, 3);
            var fourchars = path.substring(0, 4);
            if (threechars === "../") {
              path = path.substring(3);
            } else if (twochars === "./") {
              path = path.substring(2);
            } else if (threechars === "/./") {
              path = "/" + path.substring(3);
            } else if (twochars === "/." && path.length === 2) {
              path = "/";
            } else if (fourchars === "/../" || threechars === "/.." && path.length === 3) {
              path = "/" + path.substring(4);
              output = output.replace(/\/?[^\/]*$/, "");
            } else {
              var segment = path.match(/(\/?([^\/]*))/)[0];
              output += segment;
              path = path.substring(segment.length);
            }
          }
          return output;
        }
      }
    };
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/CustomEvent.js
var require_CustomEvent = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/CustomEvent.js"(exports2, module2) {
    "use strict";
    module2.exports = CustomEvent;
    var Event = require_Event();
    function CustomEvent(type, dictionary) {
      Event.call(this, type, dictionary);
    }
    CustomEvent.prototype = Object.create(Event.prototype, {
      constructor: { value: CustomEvent }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/events.js
var require_events = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/events.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      Event: require_Event(),
      UIEvent: require_UIEvent(),
      MouseEvent: require_MouseEvent(),
      CustomEvent: require_CustomEvent()
    };
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/style_parser.js
var require_style_parser = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/style_parser.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.hyphenate = exports2.parse = void 0;
    function parse(value) {
      const styles = [];
      let i = 0;
      let parenDepth = 0;
      let quote = 0;
      let valueStart = 0;
      let propStart = 0;
      let currentProp = null;
      while (i < value.length) {
        const token = value.charCodeAt(i++);
        switch (token) {
          case 40:
            parenDepth++;
            break;
          case 41:
            parenDepth--;
            break;
          case 39:
            if (quote === 0) {
              quote = 39;
            } else if (quote === 39 && value.charCodeAt(i - 1) !== 92) {
              quote = 0;
            }
            break;
          case 34:
            if (quote === 0) {
              quote = 34;
            } else if (quote === 34 && value.charCodeAt(i - 1) !== 92) {
              quote = 0;
            }
            break;
          case 58:
            if (!currentProp && parenDepth === 0 && quote === 0) {
              currentProp = hyphenate(value.substring(propStart, i - 1).trim());
              valueStart = i;
            }
            break;
          case 59:
            if (currentProp && valueStart > 0 && parenDepth === 0 && quote === 0) {
              const styleVal = value.substring(valueStart, i - 1).trim();
              styles.push(currentProp, styleVal);
              propStart = i;
              valueStart = 0;
              currentProp = null;
            }
            break;
        }
      }
      if (currentProp && valueStart) {
        const styleVal = value.slice(valueStart).trim();
        styles.push(currentProp, styleVal);
      }
      return styles;
    }
    exports2.parse = parse;
    function hyphenate(value) {
      return value.replace(/[a-z][A-Z]/g, (v) => {
        return v.charAt(0) + "-" + v.charAt(1);
      }).toLowerCase();
    }
    exports2.hyphenate = hyphenate;
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/CSSStyleDeclaration.js
var require_CSSStyleDeclaration = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/CSSStyleDeclaration.js"(exports2, module2) {
    "use strict";
    var { parse } = require_style_parser();
    module2.exports = function(elt) {
      const style = new CSSStyleDeclaration(elt);
      const handler = {
        get: function(target, property) {
          return property in target ? target[property] : target.getPropertyValue(dasherizeProperty(property));
        },
        has: function(target, key) {
          return true;
        },
        set: function(target, property, value) {
          if (property in target) {
            target[property] = value;
          } else {
            target.setProperty(dasherizeProperty(property), value ?? void 0);
          }
          return true;
        }
      };
      return new Proxy(style, handler);
    };
    function dasherizeProperty(property) {
      return property.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    }
    function CSSStyleDeclaration(elt) {
      this._element = elt;
    }
    var IMPORTANT_BANG = "!important";
    function parseStyles(value) {
      const result = {
        property: {},
        priority: {}
      };
      if (!value) {
        return result;
      }
      const styleValues = parse(value);
      if (styleValues.length < 2) {
        return result;
      }
      for (let i = 0; i < styleValues.length; i += 2) {
        const name = styleValues[i];
        let value2 = styleValues[i + 1];
        if (value2.endsWith(IMPORTANT_BANG)) {
          result.priority[name] = "important";
          value2 = value2.slice(0, -IMPORTANT_BANG.length).trim();
        }
        result.property[name] = value2;
      }
      return result;
    }
    var NO_CHANGE = {};
    CSSStyleDeclaration.prototype = Object.create(Object.prototype, {
      // Return the parsed form of the element's style attribute.
      // If the element's style attribute has never been parsed
      // or if it has changed since the last parse, then reparse it
      // Note that the styles don't get parsed until they're actually needed
      _parsed: { get: function() {
        if (!this._parsedStyles || this.cssText !== this._lastParsedText) {
          var text = this.cssText;
          this._parsedStyles = parseStyles(text);
          this._lastParsedText = text;
          delete this._names;
        }
        return this._parsedStyles;
      } },
      // Call this method any time the parsed representation of the
      // style changes.  It converts the style properties to a string and
      // sets cssText and the element's style attribute
      _serialize: { value: function() {
        var styles = this._parsed;
        var s = "";
        for (var name in styles.property) {
          if (s) s += " ";
          s += name + ": " + styles.property[name];
          if (styles.priority[name]) {
            s += " !" + styles.priority[name];
          }
          s += ";";
        }
        this.cssText = s;
        this._lastParsedText = s;
        delete this._names;
      } },
      cssText: {
        get: function() {
          return this._element.getAttribute("style");
        },
        set: function(value) {
          this._element.setAttribute("style", value);
        }
      },
      length: { get: function() {
        if (!this._names)
          this._names = Object.getOwnPropertyNames(this._parsed.property);
        return this._names.length;
      } },
      item: { value: function(n) {
        if (!this._names)
          this._names = Object.getOwnPropertyNames(this._parsed.property);
        return this._names[n];
      } },
      getPropertyValue: { value: function(property) {
        property = property.toLowerCase();
        return this._parsed.property[property] || "";
      } },
      getPropertyPriority: { value: function(property) {
        property = property.toLowerCase();
        return this._parsed.priority[property] || "";
      } },
      setProperty: { value: function(property, value, priority) {
        property = property.toLowerCase();
        if (value === null || value === void 0) {
          value = "";
        }
        if (priority === null || priority === void 0) {
          priority = "";
        }
        if (value !== NO_CHANGE) {
          value = "" + value;
        }
        value = value.trim();
        if (value === "") {
          this.removeProperty(property);
          return;
        }
        if (priority !== "" && priority !== NO_CHANGE && !/^important$/i.test(priority)) {
          return;
        }
        var styles = this._parsed;
        if (value === NO_CHANGE) {
          if (!styles.property[property]) {
            return;
          }
          if (priority !== "") {
            styles.priority[property] = "important";
          } else {
            delete styles.priority[property];
          }
        } else {
          if (value.indexOf(";") !== -1) return;
          var newprops = parseStyles(property + ":" + value);
          if (Object.getOwnPropertyNames(newprops.property).length === 0) {
            return;
          }
          if (Object.getOwnPropertyNames(newprops.priority).length !== 0) {
            return;
          }
          for (var p in newprops.property) {
            styles.property[p] = newprops.property[p];
            if (priority === NO_CHANGE) {
              continue;
            } else if (priority !== "") {
              styles.priority[p] = "important";
            } else if (styles.priority[p]) {
              delete styles.priority[p];
            }
          }
        }
        this._serialize();
      } },
      setPropertyValue: { value: function(property, value) {
        return this.setProperty(property, value, NO_CHANGE);
      } },
      setPropertyPriority: { value: function(property, priority) {
        return this.setProperty(property, NO_CHANGE, priority);
      } },
      removeProperty: { value: function(property) {
        property = property.toLowerCase();
        var styles = this._parsed;
        if (property in styles.property) {
          delete styles.property[property];
          delete styles.priority[property];
          this._serialize();
        }
      } }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/URLUtils.js
var require_URLUtils = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/URLUtils.js"(exports2, module2) {
    "use strict";
    var URL2 = require_URL();
    module2.exports = URLUtils;
    function URLUtils() {
    }
    URLUtils.prototype = Object.create(Object.prototype, {
      _url: { get: function() {
        return new URL2(this.href);
      } },
      protocol: {
        get: function() {
          var url = this._url;
          if (url && url.scheme) return url.scheme + ":";
          else return ":";
        },
        set: function(v) {
          var output = this.href;
          var url = new URL2(output);
          if (url.isAbsolute()) {
            v = v.replace(/:+$/, "");
            v = v.replace(/[^-+\.a-zA-Z0-9]/g, URL2.percentEncode);
            if (v.length > 0) {
              url.scheme = v;
              output = url.toString();
            }
          }
          this.href = output;
        }
      },
      host: {
        get: function() {
          var url = this._url;
          if (url.isAbsolute() && url.isAuthorityBased())
            return url.host + (url.port ? ":" + url.port : "");
          else
            return "";
        },
        set: function(v) {
          var output = this.href;
          var url = new URL2(output);
          if (url.isAbsolute() && url.isAuthorityBased()) {
            v = v.replace(/[^-+\._~!$&'()*,;:=a-zA-Z0-9]/g, URL2.percentEncode);
            if (v.length > 0) {
              url.host = v;
              delete url.port;
              output = url.toString();
            }
          }
          this.href = output;
        }
      },
      hostname: {
        get: function() {
          var url = this._url;
          if (url.isAbsolute() && url.isAuthorityBased())
            return url.host;
          else
            return "";
        },
        set: function(v) {
          var output = this.href;
          var url = new URL2(output);
          if (url.isAbsolute() && url.isAuthorityBased()) {
            v = v.replace(/^\/+/, "");
            v = v.replace(/[^-+\._~!$&'()*,;:=a-zA-Z0-9]/g, URL2.percentEncode);
            if (v.length > 0) {
              url.host = v;
              output = url.toString();
            }
          }
          this.href = output;
        }
      },
      port: {
        get: function() {
          var url = this._url;
          if (url.isAbsolute() && url.isAuthorityBased() && url.port !== void 0)
            return url.port;
          else
            return "";
        },
        set: function(v) {
          var output = this.href;
          var url = new URL2(output);
          if (url.isAbsolute() && url.isAuthorityBased()) {
            v = "" + v;
            v = v.replace(/[^0-9].*$/, "");
            v = v.replace(/^0+/, "");
            if (v.length === 0) v = "0";
            if (parseInt(v, 10) <= 65535) {
              url.port = v;
              output = url.toString();
            }
          }
          this.href = output;
        }
      },
      pathname: {
        get: function() {
          var url = this._url;
          if (url.isAbsolute() && url.isHierarchical())
            return url.path;
          else
            return "";
        },
        set: function(v) {
          var output = this.href;
          var url = new URL2(output);
          if (url.isAbsolute() && url.isHierarchical()) {
            if (v.charAt(0) !== "/")
              v = "/" + v;
            v = v.replace(/[^-+\._~!$&'()*,;:=@\/a-zA-Z0-9]/g, URL2.percentEncode);
            url.path = v;
            output = url.toString();
          }
          this.href = output;
        }
      },
      search: {
        get: function() {
          var url = this._url;
          if (url.isAbsolute() && url.isHierarchical() && url.query !== void 0)
            return "?" + url.query;
          else
            return "";
        },
        set: function(v) {
          var output = this.href;
          var url = new URL2(output);
          if (url.isAbsolute() && url.isHierarchical()) {
            if (v.charAt(0) === "?") v = v.substring(1);
            v = v.replace(/[^-+\._~!$&'()*,;:=@\/?a-zA-Z0-9]/g, URL2.percentEncode);
            url.query = v;
            output = url.toString();
          }
          this.href = output;
        }
      },
      hash: {
        get: function() {
          var url = this._url;
          if (url == null || url.fragment == null || url.fragment === "") {
            return "";
          } else {
            return "#" + url.fragment;
          }
        },
        set: function(v) {
          var output = this.href;
          var url = new URL2(output);
          if (v.charAt(0) === "#") v = v.substring(1);
          v = v.replace(/[^-+\._~!$&'()*,;:=@\/?a-zA-Z0-9]/g, URL2.percentEncode);
          url.fragment = v;
          output = url.toString();
          this.href = output;
        }
      },
      username: {
        get: function() {
          var url = this._url;
          return url.username || "";
        },
        set: function(v) {
          var output = this.href;
          var url = new URL2(output);
          if (url.isAbsolute()) {
            v = v.replace(/[\x00-\x1F\x7F-\uFFFF "#<>?`\/@\\:]/g, URL2.percentEncode);
            url.username = v;
            output = url.toString();
          }
          this.href = output;
        }
      },
      password: {
        get: function() {
          var url = this._url;
          return url.password || "";
        },
        set: function(v) {
          var output = this.href;
          var url = new URL2(output);
          if (url.isAbsolute()) {
            if (v === "") {
              url.password = null;
            } else {
              v = v.replace(/[\x00-\x1F\x7F-\uFFFF "#<>?`\/@\\]/g, URL2.percentEncode);
              url.password = v;
            }
            output = url.toString();
          }
          this.href = output;
        }
      },
      origin: { get: function() {
        var url = this._url;
        if (url == null) {
          return "";
        }
        var originForPort = function(defaultPort) {
          var origin = [url.scheme, url.host, +url.port || defaultPort];
          return origin[0] + "://" + origin[1] + (origin[2] === defaultPort ? "" : ":" + origin[2]);
        };
        switch (url.scheme) {
          case "ftp":
            return originForPort(21);
          case "gopher":
            return originForPort(70);
          case "http":
          case "ws":
            return originForPort(80);
          case "https":
          case "wss":
            return originForPort(443);
          default:
            return url.scheme + "://";
        }
      } }
      /*
      searchParams: {
        get: function() {
          var url = this._url;
          // XXX
        },
        set: function(v) {
          var output = this.href;
          var url = new URL(output);
          // XXX
          this.href = output;
        },
      },
      */
    });
    URLUtils._inherit = function(proto) {
      Object.getOwnPropertyNames(URLUtils.prototype).forEach(function(p) {
        if (p === "constructor" || p === "href") {
          return;
        }
        var desc = Object.getOwnPropertyDescriptor(URLUtils.prototype, p);
        Object.defineProperty(proto, p, desc);
      });
    };
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/defineElement.js
var require_defineElement = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/defineElement.js"(exports2, module2) {
    "use strict";
    var attributes = require_attributes();
    var isApiWritable = require_config().isApiWritable;
    module2.exports = function(spec, defaultConstructor, tagList, tagNameToImpl) {
      var c = spec.ctor;
      if (c) {
        var props = spec.props || {};
        if (spec.attributes) {
          for (var n in spec.attributes) {
            var attr = spec.attributes[n];
            if (typeof attr !== "object" || Array.isArray(attr)) attr = { type: attr };
            if (!attr.name) attr.name = n.toLowerCase();
            props[n] = attributes.property(attr);
          }
        }
        props.constructor = { value: c, writable: isApiWritable };
        c.prototype = Object.create((spec.superclass || defaultConstructor).prototype, props);
        if (spec.events) {
          addEventHandlers(c, spec.events);
        }
        tagList[spec.name] = c;
      } else {
        c = defaultConstructor;
      }
      (spec.tags || spec.tag && [spec.tag] || []).forEach(function(tag) {
        tagNameToImpl[tag] = c;
      });
      return c;
    };
    function EventHandlerBuilder(body, document, form, element) {
      this.body = body;
      this.document = document;
      this.form = form;
      this.element = element;
    }
    EventHandlerBuilder.prototype.build = function() {
      return () => {
      };
    };
    function EventHandlerChangeHandler(elt, name, oldval, newval) {
      var doc = elt.ownerDocument || /* @__PURE__ */ Object.create(null);
      var form = elt.form || /* @__PURE__ */ Object.create(null);
      elt[name] = new EventHandlerBuilder(newval, doc, form, elt).build();
    }
    function addEventHandlers(c, eventHandlerTypes) {
      var p = c.prototype;
      eventHandlerTypes.forEach(function(type) {
        Object.defineProperty(p, "on" + type, {
          get: function() {
            return this._getEventHandler(type);
          },
          set: function(v) {
            this._setEventHandler(type, v);
          }
        });
        attributes.registerChangeHandler(c, "on" + type, EventHandlerChangeHandler);
      });
    }
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/htmlelts.js
var require_htmlelts = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/htmlelts.js"(exports2) {
    "use strict";
    var Node = require_Node();
    var Element = require_Element();
    var CSSStyleDeclaration = require_CSSStyleDeclaration();
    var utils = require_utils();
    var URLUtils = require_URLUtils();
    var defineElement = require_defineElement();
    var htmlElements = exports2.elements = {};
    var htmlNameToImpl = /* @__PURE__ */ Object.create(null);
    exports2.createElement = function(doc, localName, prefix) {
      var impl = htmlNameToImpl[localName] || HTMLUnknownElement;
      return new impl(doc, localName, prefix);
    };
    function define(spec) {
      return defineElement(spec, HTMLElement, htmlElements, htmlNameToImpl);
    }
    function URL2(attr) {
      return {
        get: function() {
          var v = this._getattr(attr);
          if (v === null) {
            return "";
          }
          var url = this.doc._resolve(v);
          return url === null ? v : url;
        },
        set: function(value) {
          this._setattr(attr, value);
        }
      };
    }
    function CORS(attr) {
      return {
        get: function() {
          var v = this._getattr(attr);
          if (v === null) {
            return null;
          }
          if (v.toLowerCase() === "use-credentials") {
            return "use-credentials";
          }
          return "anonymous";
        },
        set: function(value) {
          if (value === null || value === void 0) {
            this.removeAttribute(attr);
          } else {
            this._setattr(attr, value);
          }
        }
      };
    }
    var REFERRER = {
      type: ["", "no-referrer", "no-referrer-when-downgrade", "same-origin", "origin", "strict-origin", "origin-when-cross-origin", "strict-origin-when-cross-origin", "unsafe-url"],
      missing: ""
    };
    var focusableElements = {
      "A": true,
      "LINK": true,
      "BUTTON": true,
      "INPUT": true,
      "SELECT": true,
      "TEXTAREA": true,
      "COMMAND": true
    };
    var HTMLFormElement = function(doc, localName, prefix) {
      HTMLElement.call(this, doc, localName, prefix);
      this._form = null;
    };
    var HTMLElement = exports2.HTMLElement = define({
      superclass: Element,
      name: "HTMLElement",
      ctor: function HTMLElement2(doc, localName, prefix) {
        Element.call(this, doc, localName, utils.NAMESPACE.HTML, prefix);
      },
      props: {
        dangerouslySetInnerHTML: {
          set: function(v) {
            this._innerHTML = v;
          }
        },
        innerHTML: {
          get: function() {
            return this.serialize();
          },
          set: function(v) {
            var parser = this.ownerDocument.implementation.mozHTMLParser(
              this.ownerDocument._address,
              this
            );
            parser.parse(v === null ? "" : String(v), true);
            var target = this instanceof htmlNameToImpl.template ? this.content : this;
            while (target.hasChildNodes())
              target.removeChild(target.firstChild);
            target.appendChild(parser._asDocumentFragment());
          }
        },
        style: { get: function() {
          if (!this._style)
            this._style = new CSSStyleDeclaration(this);
          return this._style;
        }, set: function(v) {
          if (v === null || v === void 0) {
            v = "";
          }
          this._setattr("style", String(v));
        } },
        // These can't really be implemented server-side in a reasonable way.
        blur: { value: function() {
        } },
        focus: { value: function() {
        } },
        forceSpellCheck: { value: function() {
        } },
        click: { value: function() {
          if (this._click_in_progress) return;
          this._click_in_progress = true;
          try {
            if (this._pre_click_activation_steps)
              this._pre_click_activation_steps();
            var event = this.ownerDocument.createEvent("MouseEvent");
            event.initMouseEvent(
              "click",
              true,
              true,
              this.ownerDocument.defaultView,
              1,
              0,
              0,
              0,
              0,
              // These 4 should be initialized with
              // the actually current keyboard state
              // somehow...
              false,
              false,
              false,
              false,
              0,
              null
            );
            var success = this.dispatchEvent(event);
            if (success) {
              if (this._post_click_activation_steps)
                this._post_click_activation_steps(event);
            } else {
              if (this._cancelled_activation_steps)
                this._cancelled_activation_steps();
            }
          } finally {
            this._click_in_progress = false;
          }
        } },
        submit: { value: utils.nyi }
      },
      attributes: {
        title: String,
        lang: String,
        dir: { type: ["ltr", "rtl", "auto"], missing: "" },
        draggable: { type: ["true", "false"], treatNullAsEmptyString: true },
        spellcheck: { type: ["true", "false"], missing: "" },
        enterKeyHint: { type: ["enter", "done", "go", "next", "previous", "search", "send"], missing: "" },
        autoCapitalize: { type: ["off", "on", "none", "sentences", "words", "characters"], missing: "" },
        autoFocus: Boolean,
        accessKey: String,
        nonce: String,
        hidden: Boolean,
        translate: { type: ["no", "yes"], missing: "" },
        tabIndex: { type: "long", default: function() {
          if (this.tagName in focusableElements || this.contentEditable)
            return 0;
          else
            return -1;
        } }
      },
      events: [
        "abort",
        "canplay",
        "canplaythrough",
        "change",
        "click",
        "contextmenu",
        "cuechange",
        "dblclick",
        "drag",
        "dragend",
        "dragenter",
        "dragleave",
        "dragover",
        "dragstart",
        "drop",
        "durationchange",
        "emptied",
        "ended",
        "input",
        "invalid",
        "keydown",
        "keypress",
        "keyup",
        "loadeddata",
        "loadedmetadata",
        "loadstart",
        "mousedown",
        "mousemove",
        "mouseout",
        "mouseover",
        "mouseup",
        "mousewheel",
        "pause",
        "play",
        "playing",
        "progress",
        "ratechange",
        "readystatechange",
        "reset",
        "seeked",
        "seeking",
        "select",
        "show",
        "stalled",
        "submit",
        "suspend",
        "timeupdate",
        "volumechange",
        "waiting",
        // These last 5 event types will be overriden by HTMLBodyElement
        "blur",
        "error",
        "focus",
        "load",
        "scroll"
      ]
    });
    var HTMLUnknownElement = define({
      name: "HTMLUnknownElement",
      ctor: function HTMLUnknownElement2(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      }
    });
    var formAssociatedProps = {
      // See http://www.w3.org/TR/html5/association-of-controls-and-forms.html#form-owner
      form: { get: function() {
        return this._form;
      } }
    };
    define({
      tag: "a",
      name: "HTMLAnchorElement",
      ctor: function HTMLAnchorElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      props: {
        _post_click_activation_steps: { value: function(e) {
          if (this.href) {
            this.ownerDocument.defaultView.location = this.href;
          }
        } }
      },
      attributes: {
        href: URL2,
        ping: String,
        download: String,
        target: String,
        rel: String,
        media: String,
        hreflang: String,
        type: String,
        referrerPolicy: REFERRER,
        // Obsolete
        coords: String,
        charset: String,
        name: String,
        rev: String,
        shape: String
      }
    });
    URLUtils._inherit(htmlNameToImpl.a.prototype);
    define({
      tag: "area",
      name: "HTMLAreaElement",
      ctor: function HTMLAreaElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        alt: String,
        target: String,
        download: String,
        rel: String,
        media: String,
        href: URL2,
        hreflang: String,
        type: String,
        shape: String,
        coords: String,
        ping: String,
        // XXX: also reflect relList
        referrerPolicy: REFERRER,
        // Obsolete
        noHref: Boolean
      }
    });
    URLUtils._inherit(htmlNameToImpl.area.prototype);
    define({
      tag: "br",
      name: "HTMLBRElement",
      ctor: function HTMLBRElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        // Obsolete
        clear: String
      }
    });
    define({
      tag: "base",
      name: "HTMLBaseElement",
      ctor: function HTMLBaseElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        "target": String
      }
    });
    define({
      tag: "body",
      name: "HTMLBodyElement",
      ctor: function HTMLBodyElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      // Certain event handler attributes on a <body> tag actually set
      // handlers for the window rather than just that element.  Define
      // getters and setters for those here.  Note that some of these override
      // properties on HTMLElement.prototype.
      // XXX: If I add support for <frameset>, these have to go there, too
      // XXX
      // When the Window object is implemented, these attribute will have
      // to work with the same-named attributes on the Window.
      events: [
        "afterprint",
        "beforeprint",
        "beforeunload",
        "blur",
        "error",
        "focus",
        "hashchange",
        "load",
        "message",
        "offline",
        "online",
        "pagehide",
        "pageshow",
        "popstate",
        "resize",
        "scroll",
        "storage",
        "unload"
      ],
      attributes: {
        // Obsolete
        text: { type: String, treatNullAsEmptyString: true },
        link: { type: String, treatNullAsEmptyString: true },
        vLink: { type: String, treatNullAsEmptyString: true },
        aLink: { type: String, treatNullAsEmptyString: true },
        bgColor: { type: String, treatNullAsEmptyString: true },
        background: String
      }
    });
    define({
      tag: "button",
      name: "HTMLButtonElement",
      ctor: function HTMLButtonElement(doc, localName, prefix) {
        HTMLFormElement.call(this, doc, localName, prefix);
      },
      props: formAssociatedProps,
      attributes: {
        name: String,
        value: String,
        disabled: Boolean,
        autofocus: Boolean,
        type: { type: ["submit", "reset", "button", "menu"], missing: "submit" },
        formTarget: String,
        formAction: URL2,
        formNoValidate: Boolean,
        formMethod: { type: ["get", "post", "dialog"], invalid: "get", missing: "" },
        formEnctype: { type: ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"], invalid: "application/x-www-form-urlencoded", missing: "" }
      }
    });
    define({
      tag: "dl",
      name: "HTMLDListElement",
      ctor: function HTMLDListElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        // Obsolete
        compact: Boolean
      }
    });
    define({
      tag: "data",
      name: "HTMLDataElement",
      ctor: function HTMLDataElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        value: String
      }
    });
    define({
      tag: "datalist",
      name: "HTMLDataListElement",
      ctor: function HTMLDataListElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      }
    });
    define({
      tag: "details",
      name: "HTMLDetailsElement",
      ctor: function HTMLDetailsElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        "open": Boolean
      }
    });
    define({
      tag: "div",
      name: "HTMLDivElement",
      ctor: function HTMLDivElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        // Obsolete
        align: String
      }
    });
    define({
      tag: "embed",
      name: "HTMLEmbedElement",
      ctor: function HTMLEmbedElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        src: URL2,
        type: String,
        width: String,
        height: String,
        // Obsolete
        align: String,
        name: String
      }
    });
    define({
      tag: "fieldset",
      name: "HTMLFieldSetElement",
      ctor: function HTMLFieldSetElement(doc, localName, prefix) {
        HTMLFormElement.call(this, doc, localName, prefix);
      },
      props: formAssociatedProps,
      attributes: {
        disabled: Boolean,
        name: String
      }
    });
    define({
      tag: "form",
      name: "HTMLFormElement",
      ctor: function HTMLFormElement2(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        action: String,
        autocomplete: { type: ["on", "off"], missing: "on" },
        name: String,
        acceptCharset: { name: "accept-charset" },
        target: String,
        noValidate: Boolean,
        method: { type: ["get", "post", "dialog"], invalid: "get", missing: "get" },
        // Both enctype and encoding reflect the enctype content attribute
        enctype: { type: ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"], invalid: "application/x-www-form-urlencoded", missing: "application/x-www-form-urlencoded" },
        encoding: { name: "enctype", type: ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"], invalid: "application/x-www-form-urlencoded", missing: "application/x-www-form-urlencoded" }
      }
    });
    define({
      tag: "hr",
      name: "HTMLHRElement",
      ctor: function HTMLHRElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        // Obsolete
        align: String,
        color: String,
        noShade: Boolean,
        size: String,
        width: String
      }
    });
    define({
      tag: "head",
      name: "HTMLHeadElement",
      ctor: function HTMLHeadElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      }
    });
    define({
      tags: ["h1", "h2", "h3", "h4", "h5", "h6"],
      name: "HTMLHeadingElement",
      ctor: function HTMLHeadingElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        // Obsolete
        align: String
      }
    });
    define({
      tag: "html",
      name: "HTMLHtmlElement",
      ctor: function HTMLHtmlElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        xmlns: URL2,
        // Obsolete
        version: String
      }
    });
    define({
      tag: "iframe",
      name: "HTMLIFrameElement",
      ctor: function HTMLIFrameElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        src: URL2,
        srcdoc: String,
        name: String,
        width: String,
        height: String,
        // XXX: sandbox is a reflected settable token list
        seamless: Boolean,
        allow: Boolean,
        allowFullscreen: Boolean,
        allowUserMedia: Boolean,
        allowPaymentRequest: Boolean,
        referrerPolicy: REFERRER,
        loading: { type: ["eager", "lazy"], treatNullAsEmptyString: true },
        // Obsolete
        align: String,
        scrolling: String,
        frameBorder: String,
        longDesc: URL2,
        marginHeight: { type: String, treatNullAsEmptyString: true },
        marginWidth: { type: String, treatNullAsEmptyString: true }
      }
    });
    define({
      tag: "img",
      name: "HTMLImageElement",
      ctor: function HTMLImageElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        alt: String,
        src: URL2,
        srcset: String,
        crossOrigin: CORS,
        useMap: String,
        isMap: Boolean,
        sizes: String,
        height: { type: "unsigned long", default: 0 },
        width: { type: "unsigned long", default: 0 },
        referrerPolicy: REFERRER,
        loading: { type: ["eager", "lazy"], missing: "" },
        // Obsolete:
        name: String,
        lowsrc: URL2,
        align: String,
        hspace: { type: "unsigned long", default: 0 },
        vspace: { type: "unsigned long", default: 0 },
        longDesc: URL2,
        border: { type: String, treatNullAsEmptyString: true }
      }
    });
    define({
      tag: "input",
      name: "HTMLInputElement",
      ctor: function HTMLInputElement(doc, localName, prefix) {
        HTMLFormElement.call(this, doc, localName, prefix);
      },
      props: {
        form: formAssociatedProps.form,
        _post_click_activation_steps: { value: function(e) {
          if (this.type === "checkbox") {
            this.checked = !this.checked;
          } else if (this.type === "radio") {
            var group = this.form.getElementsByName(this.name);
            for (var i = group.length - 1; i >= 0; i--) {
              var el = group[i];
              el.checked = el === this;
            }
          }
        } }
      },
      attributes: {
        name: String,
        disabled: Boolean,
        autofocus: Boolean,
        accept: String,
        alt: String,
        max: String,
        min: String,
        pattern: String,
        placeholder: String,
        step: String,
        dirName: String,
        defaultValue: { name: "value" },
        multiple: Boolean,
        required: Boolean,
        readOnly: Boolean,
        checked: Boolean,
        value: String,
        src: URL2,
        defaultChecked: { name: "checked", type: Boolean },
        size: { type: "unsigned long", default: 20, min: 1, setmin: 1 },
        width: { type: "unsigned long", min: 0, setmin: 0, default: 0 },
        height: { type: "unsigned long", min: 0, setmin: 0, default: 0 },
        minLength: { type: "unsigned long", min: 0, setmin: 0, default: -1 },
        maxLength: { type: "unsigned long", min: 0, setmin: 0, default: -1 },
        autocomplete: String,
        // It's complicated
        type: {
          type: [
            "text",
            "hidden",
            "search",
            "tel",
            "url",
            "email",
            "password",
            "datetime",
            "date",
            "month",
            "week",
            "time",
            "datetime-local",
            "number",
            "range",
            "color",
            "checkbox",
            "radio",
            "file",
            "submit",
            "image",
            "reset",
            "button"
          ],
          missing: "text"
        },
        formTarget: String,
        formNoValidate: Boolean,
        formMethod: { type: ["get", "post"], invalid: "get", missing: "" },
        formEnctype: { type: ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"], invalid: "application/x-www-form-urlencoded", missing: "" },
        inputMode: { type: ["verbatim", "latin", "latin-name", "latin-prose", "full-width-latin", "kana", "kana-name", "katakana", "numeric", "tel", "email", "url"], missing: "" },
        // Obsolete
        align: String,
        useMap: String
      }
    });
    define({
      tag: "keygen",
      name: "HTMLKeygenElement",
      ctor: function HTMLKeygenElement(doc, localName, prefix) {
        HTMLFormElement.call(this, doc, localName, prefix);
      },
      props: formAssociatedProps,
      attributes: {
        name: String,
        disabled: Boolean,
        autofocus: Boolean,
        challenge: String,
        keytype: { type: ["rsa"], missing: "" }
      }
    });
    define({
      tag: "li",
      name: "HTMLLIElement",
      ctor: function HTMLLIElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        value: { type: "long", default: 0 },
        // Obsolete
        type: String
      }
    });
    define({
      tag: "label",
      name: "HTMLLabelElement",
      ctor: function HTMLLabelElement(doc, localName, prefix) {
        HTMLFormElement.call(this, doc, localName, prefix);
      },
      props: formAssociatedProps,
      attributes: {
        htmlFor: { name: "for", type: String }
      }
    });
    define({
      tag: "legend",
      name: "HTMLLegendElement",
      ctor: function HTMLLegendElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        // Obsolete
        align: String
      }
    });
    define({
      tag: "link",
      name: "HTMLLinkElement",
      ctor: function HTMLLinkElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        // XXX Reflect DOMSettableTokenList sizes also DOMTokenList relList
        href: URL2,
        rel: String,
        media: String,
        hreflang: String,
        type: String,
        crossOrigin: CORS,
        nonce: String,
        integrity: String,
        referrerPolicy: REFERRER,
        imageSizes: String,
        imageSrcset: String,
        // Obsolete
        charset: String,
        rev: String,
        target: String
      }
    });
    define({
      tag: "map",
      name: "HTMLMapElement",
      ctor: function HTMLMapElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        name: String
      }
    });
    define({
      tag: "menu",
      name: "HTMLMenuElement",
      ctor: function HTMLMenuElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        // XXX: not quite right, default should be popup if parent element is
        // popup.
        type: { type: ["context", "popup", "toolbar"], missing: "toolbar" },
        label: String,
        // Obsolete
        compact: Boolean
      }
    });
    define({
      tag: "meta",
      name: "HTMLMetaElement",
      ctor: function HTMLMetaElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        name: String,
        content: String,
        httpEquiv: { name: "http-equiv", type: String },
        // Obsolete
        scheme: String
      }
    });
    define({
      tag: "meter",
      name: "HTMLMeterElement",
      ctor: function HTMLMeterElement(doc, localName, prefix) {
        HTMLFormElement.call(this, doc, localName, prefix);
      },
      props: formAssociatedProps
    });
    define({
      tags: ["ins", "del"],
      name: "HTMLModElement",
      ctor: function HTMLModElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        cite: URL2,
        dateTime: String
      }
    });
    define({
      tag: "ol",
      name: "HTMLOListElement",
      ctor: function HTMLOListElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      props: {
        // Utility function (see the start attribute default value). Returns
        // the number of <li> children of this element
        _numitems: { get: function() {
          var items = 0;
          this.childNodes.forEach(function(n) {
            if (n.nodeType === Node.ELEMENT_NODE && n.tagName === "LI")
              items++;
          });
          return items;
        } }
      },
      attributes: {
        type: String,
        reversed: Boolean,
        start: {
          type: "long",
          default: function() {
            if (this.reversed)
              return this._numitems;
            else
              return 1;
          }
        },
        // Obsolete
        compact: Boolean
      }
    });
    define({
      tag: "object",
      name: "HTMLObjectElement",
      ctor: function HTMLObjectElement(doc, localName, prefix) {
        HTMLFormElement.call(this, doc, localName, prefix);
      },
      props: formAssociatedProps,
      attributes: {
        data: URL2,
        type: String,
        name: String,
        useMap: String,
        typeMustMatch: Boolean,
        width: String,
        height: String,
        // Obsolete
        align: String,
        archive: String,
        code: String,
        declare: Boolean,
        hspace: { type: "unsigned long", default: 0 },
        standby: String,
        vspace: { type: "unsigned long", default: 0 },
        codeBase: URL2,
        codeType: String,
        border: { type: String, treatNullAsEmptyString: true }
      }
    });
    define({
      tag: "optgroup",
      name: "HTMLOptGroupElement",
      ctor: function HTMLOptGroupElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        disabled: Boolean,
        label: String
      }
    });
    define({
      tag: "option",
      name: "HTMLOptionElement",
      ctor: function HTMLOptionElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      props: {
        form: { get: function() {
          var p = this.parentNode;
          while (p && p.nodeType === Node.ELEMENT_NODE) {
            if (p.localName === "select") return p.form;
            p = p.parentNode;
          }
        } },
        value: {
          get: function() {
            return this._getattr("value") || this.text;
          },
          set: function(v) {
            this._setattr("value", v);
          }
        },
        text: {
          get: function() {
            return this.textContent.replace(/[ \t\n\f\r]+/g, " ").trim();
          },
          set: function(v) {
            this.textContent = v;
          }
        }
        // missing: index
      },
      attributes: {
        disabled: Boolean,
        defaultSelected: { name: "selected", type: Boolean },
        label: String
      }
    });
    define({
      tag: "output",
      name: "HTMLOutputElement",
      ctor: function HTMLOutputElement(doc, localName, prefix) {
        HTMLFormElement.call(this, doc, localName, prefix);
      },
      props: formAssociatedProps,
      attributes: {
        // XXX Reflect for/htmlFor as a settable token list
        name: String
      }
    });
    define({
      tag: "p",
      name: "HTMLParagraphElement",
      ctor: function HTMLParagraphElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        // Obsolete
        align: String
      }
    });
    define({
      tag: "param",
      name: "HTMLParamElement",
      ctor: function HTMLParamElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        name: String,
        value: String,
        // Obsolete
        type: String,
        valueType: String
      }
    });
    define({
      tags: [
        "pre",
        /*legacy elements:*/
        "listing",
        "xmp"
      ],
      name: "HTMLPreElement",
      ctor: function HTMLPreElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        // Obsolete
        width: { type: "long", default: 0 }
      }
    });
    define({
      tag: "progress",
      name: "HTMLProgressElement",
      ctor: function HTMLProgressElement(doc, localName, prefix) {
        HTMLFormElement.call(this, doc, localName, prefix);
      },
      props: formAssociatedProps,
      attributes: {
        max: { type: Number, float: true, default: 1, min: 0 }
      }
    });
    define({
      tags: ["q", "blockquote"],
      name: "HTMLQuoteElement",
      ctor: function HTMLQuoteElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        cite: URL2
      }
    });
    define({
      tag: "script",
      name: "HTMLScriptElement",
      ctor: function HTMLScriptElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      props: {
        text: {
          get: function() {
            var s = "";
            for (var i = 0, n = this.childNodes.length; i < n; i++) {
              var child = this.childNodes[i];
              if (child.nodeType === Node.TEXT_NODE)
                s += child._data;
            }
            return s;
          },
          set: function(value) {
            this.removeChildren();
            if (value !== null && value !== "") {
              this.appendChild(this.ownerDocument.createTextNode(value));
            }
          }
        }
      },
      attributes: {
        src: URL2,
        type: String,
        charset: String,
        referrerPolicy: REFERRER,
        defer: Boolean,
        async: Boolean,
        nomodule: Boolean,
        crossOrigin: CORS,
        nonce: String,
        integrity: String
      }
    });
    define({
      tag: "select",
      name: "HTMLSelectElement",
      ctor: function HTMLSelectElement(doc, localName, prefix) {
        HTMLFormElement.call(this, doc, localName, prefix);
      },
      props: {
        form: formAssociatedProps.form,
        options: { get: function() {
          return this.getElementsByTagName("option");
        } }
      },
      attributes: {
        autocomplete: String,
        // It's complicated
        name: String,
        disabled: Boolean,
        autofocus: Boolean,
        multiple: Boolean,
        required: Boolean,
        size: { type: "unsigned long", default: 0 }
      }
    });
    define({
      tag: "span",
      name: "HTMLSpanElement",
      ctor: function HTMLSpanElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      }
    });
    define({
      tag: "style",
      name: "HTMLStyleElement",
      ctor: function HTMLStyleElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        media: String,
        type: String,
        scoped: Boolean
      }
    });
    define({
      tag: "caption",
      name: "HTMLTableCaptionElement",
      ctor: function HTMLTableCaptionElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        // Obsolete
        align: String
      }
    });
    define({
      name: "HTMLTableCellElement",
      ctor: function HTMLTableCellElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        colSpan: { type: "unsigned long", default: 1 },
        rowSpan: { type: "unsigned long", default: 1 },
        //XXX Also reflect settable token list headers
        scope: { type: ["row", "col", "rowgroup", "colgroup"], missing: "" },
        abbr: String,
        // Obsolete
        align: String,
        axis: String,
        height: String,
        width: String,
        ch: { name: "char", type: String },
        chOff: { name: "charoff", type: String },
        noWrap: Boolean,
        vAlign: String,
        bgColor: { type: String, treatNullAsEmptyString: true }
      }
    });
    define({
      tags: ["col", "colgroup"],
      name: "HTMLTableColElement",
      ctor: function HTMLTableColElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        span: { type: "limited unsigned long with fallback", default: 1, min: 1 },
        // Obsolete
        align: String,
        ch: { name: "char", type: String },
        chOff: { name: "charoff", type: String },
        vAlign: String,
        width: String
      }
    });
    define({
      tag: "table",
      name: "HTMLTableElement",
      ctor: function HTMLTableElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      props: {
        rows: { get: function() {
          return this.getElementsByTagName("tr");
        } }
      },
      attributes: {
        // Obsolete
        align: String,
        border: String,
        frame: String,
        rules: String,
        summary: String,
        width: String,
        bgColor: { type: String, treatNullAsEmptyString: true },
        cellPadding: { type: String, treatNullAsEmptyString: true },
        cellSpacing: { type: String, treatNullAsEmptyString: true }
      }
    });
    define({
      tag: "template",
      name: "HTMLTemplateElement",
      ctor: function HTMLTemplateElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
        this._contentFragment = doc._templateDoc.createDocumentFragment();
      },
      props: {
        content: { get: function() {
          return this._contentFragment;
        } },
        serialize: { value: function() {
          return this.content.serialize();
        } }
      }
    });
    define({
      tag: "tr",
      name: "HTMLTableRowElement",
      ctor: function HTMLTableRowElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      props: {
        cells: { get: function() {
          return this.querySelectorAll("td,th");
        } }
      },
      attributes: {
        // Obsolete
        align: String,
        ch: { name: "char", type: String },
        chOff: { name: "charoff", type: String },
        vAlign: String,
        bgColor: { type: String, treatNullAsEmptyString: true }
      }
    });
    define({
      tags: ["thead", "tfoot", "tbody"],
      name: "HTMLTableSectionElement",
      ctor: function HTMLTableSectionElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      props: {
        rows: { get: function() {
          return this.getElementsByTagName("tr");
        } }
      },
      attributes: {
        // Obsolete
        align: String,
        ch: { name: "char", type: String },
        chOff: { name: "charoff", type: String },
        vAlign: String
      }
    });
    define({
      tag: "textarea",
      name: "HTMLTextAreaElement",
      ctor: function HTMLTextAreaElement(doc, localName, prefix) {
        HTMLFormElement.call(this, doc, localName, prefix);
      },
      props: {
        form: formAssociatedProps.form,
        type: { get: function() {
          return "textarea";
        } },
        defaultValue: {
          get: function() {
            return this.textContent;
          },
          set: function(v) {
            this.textContent = v;
          }
        },
        value: {
          get: function() {
            return this.defaultValue;
          },
          set: function(v) {
            this.defaultValue = v;
          }
        },
        textLength: { get: function() {
          return this.value.length;
        } }
      },
      attributes: {
        autocomplete: String,
        // It's complicated
        name: String,
        disabled: Boolean,
        autofocus: Boolean,
        placeholder: String,
        wrap: String,
        dirName: String,
        required: Boolean,
        readOnly: Boolean,
        rows: { type: "limited unsigned long with fallback", default: 2 },
        cols: { type: "limited unsigned long with fallback", default: 20 },
        maxLength: { type: "unsigned long", min: 0, setmin: 0, default: -1 },
        minLength: { type: "unsigned long", min: 0, setmin: 0, default: -1 },
        inputMode: { type: ["verbatim", "latin", "latin-name", "latin-prose", "full-width-latin", "kana", "kana-name", "katakana", "numeric", "tel", "email", "url"], missing: "" }
      }
    });
    define({
      tag: "time",
      name: "HTMLTimeElement",
      ctor: function HTMLTimeElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        dateTime: String,
        pubDate: Boolean
      }
    });
    define({
      tag: "title",
      name: "HTMLTitleElement",
      ctor: function HTMLTitleElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      props: {
        text: { get: function() {
          return this.textContent;
        } }
      }
    });
    define({
      tag: "ul",
      name: "HTMLUListElement",
      ctor: function HTMLUListElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        type: String,
        // Obsolete
        compact: Boolean
      }
    });
    define({
      name: "HTMLMediaElement",
      ctor: function HTMLMediaElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        src: URL2,
        crossOrigin: CORS,
        preload: { type: ["metadata", "none", "auto", { value: "", alias: "auto" }], missing: "auto" },
        loop: Boolean,
        autoplay: Boolean,
        mediaGroup: String,
        controls: Boolean,
        defaultMuted: { name: "muted", type: Boolean }
      }
    });
    define({
      name: "HTMLAudioElement",
      tag: "audio",
      superclass: htmlElements.HTMLMediaElement,
      ctor: function HTMLAudioElement(doc, localName, prefix) {
        htmlElements.HTMLMediaElement.call(this, doc, localName, prefix);
      }
    });
    define({
      name: "HTMLVideoElement",
      tag: "video",
      superclass: htmlElements.HTMLMediaElement,
      ctor: function HTMLVideoElement(doc, localName, prefix) {
        htmlElements.HTMLMediaElement.call(this, doc, localName, prefix);
      },
      attributes: {
        poster: URL2,
        width: { type: "unsigned long", min: 0, default: 0 },
        height: { type: "unsigned long", min: 0, default: 0 }
      }
    });
    define({
      tag: "td",
      name: "HTMLTableDataCellElement",
      superclass: htmlElements.HTMLTableCellElement,
      ctor: function HTMLTableDataCellElement(doc, localName, prefix) {
        htmlElements.HTMLTableCellElement.call(this, doc, localName, prefix);
      }
    });
    define({
      tag: "th",
      name: "HTMLTableHeaderCellElement",
      superclass: htmlElements.HTMLTableCellElement,
      ctor: function HTMLTableHeaderCellElement(doc, localName, prefix) {
        htmlElements.HTMLTableCellElement.call(this, doc, localName, prefix);
      }
    });
    define({
      tag: "frameset",
      name: "HTMLFrameSetElement",
      ctor: function HTMLFrameSetElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      }
    });
    define({
      tag: "frame",
      name: "HTMLFrameElement",
      ctor: function HTMLFrameElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      }
    });
    define({
      tag: "canvas",
      name: "HTMLCanvasElement",
      ctor: function HTMLCanvasElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      props: {
        getContext: { value: utils.nyi },
        probablySupportsContext: { value: utils.nyi },
        setContext: { value: utils.nyi },
        transferControlToProxy: { value: utils.nyi },
        toDataURL: { value: utils.nyi },
        toBlob: { value: utils.nyi }
      },
      attributes: {
        width: { type: "unsigned long", default: 300 },
        height: { type: "unsigned long", default: 150 }
      }
    });
    define({
      tag: "dialog",
      name: "HTMLDialogElement",
      ctor: function HTMLDialogElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      props: {
        show: { value: utils.nyi },
        showModal: { value: utils.nyi },
        close: { value: utils.nyi }
      },
      attributes: {
        open: Boolean,
        returnValue: String
      }
    });
    define({
      tag: "menuitem",
      name: "HTMLMenuItemElement",
      ctor: function HTMLMenuItemElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      props: {
        // The menuitem's label
        _label: {
          get: function() {
            var val = this._getattr("label");
            if (val !== null && val !== "") {
              return val;
            }
            val = this.textContent;
            return val.replace(/[ \t\n\f\r]+/g, " ").trim();
          }
        },
        // The menuitem label IDL attribute
        label: {
          get: function() {
            var val = this._getattr("label");
            if (val !== null) {
              return val;
            }
            return this._label;
          },
          set: function(v) {
            this._setattr("label", v);
          }
        }
      },
      attributes: {
        type: { type: ["command", "checkbox", "radio"], missing: "command" },
        icon: URL2,
        disabled: Boolean,
        checked: Boolean,
        radiogroup: String,
        default: Boolean
      }
    });
    define({
      tag: "source",
      name: "HTMLSourceElement",
      ctor: function HTMLSourceElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        srcset: String,
        sizes: String,
        media: String,
        src: URL2,
        type: String,
        width: String,
        height: String
      }
    });
    define({
      tag: "track",
      name: "HTMLTrackElement",
      ctor: function HTMLTrackElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        src: URL2,
        srclang: String,
        label: String,
        default: Boolean,
        kind: { type: ["subtitles", "captions", "descriptions", "chapters", "metadata"], missing: "subtitles", invalid: "metadata" }
      },
      props: {
        NONE: { get: function() {
          return 0;
        } },
        LOADING: { get: function() {
          return 1;
        } },
        LOADED: { get: function() {
          return 2;
        } },
        ERROR: { get: function() {
          return 3;
        } },
        readyState: { get: utils.nyi },
        track: { get: utils.nyi }
      }
    });
    define({
      // obsolete
      tag: "font",
      name: "HTMLFontElement",
      ctor: function HTMLFontElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        color: { type: String, treatNullAsEmptyString: true },
        face: { type: String },
        size: { type: String }
      }
    });
    define({
      // obsolete
      tag: "dir",
      name: "HTMLDirectoryElement",
      ctor: function HTMLDirectoryElement(doc, localName, prefix) {
        HTMLElement.call(this, doc, localName, prefix);
      },
      attributes: {
        compact: Boolean
      }
    });
    define({
      tags: [
        "abbr",
        "address",
        "article",
        "aside",
        "b",
        "bdi",
        "bdo",
        "cite",
        "content",
        "code",
        "dd",
        "dfn",
        "dt",
        "em",
        "figcaption",
        "figure",
        "footer",
        "header",
        "hgroup",
        "i",
        "kbd",
        "main",
        "mark",
        "nav",
        "noscript",
        "rb",
        "rp",
        "rt",
        "rtc",
        "ruby",
        "s",
        "samp",
        "section",
        "small",
        "strong",
        "sub",
        "summary",
        "sup",
        "u",
        "var",
        "wbr",
        // Legacy elements
        "acronym",
        "basefont",
        "big",
        "center",
        "nobr",
        "noembed",
        "noframes",
        "plaintext",
        "strike",
        "tt"
      ]
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/svg.js
var require_svg = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/svg.js"(exports2) {
    "use strict";
    var Element = require_Element();
    var defineElement = require_defineElement();
    var utils = require_utils();
    var CSSStyleDeclaration = require_CSSStyleDeclaration();
    var svgElements = exports2.elements = {};
    var svgNameToImpl = /* @__PURE__ */ Object.create(null);
    exports2.createElement = function(doc, localName, prefix) {
      var impl = svgNameToImpl[localName] || SVGElement;
      return new impl(doc, localName, prefix);
    };
    function define(spec) {
      return defineElement(spec, SVGElement, svgElements, svgNameToImpl);
    }
    var SVGElement = define({
      superclass: Element,
      name: "SVGElement",
      ctor: function SVGElement2(doc, localName, prefix) {
        Element.call(this, doc, localName, utils.NAMESPACE.SVG, prefix);
      },
      props: {
        style: { get: function() {
          if (!this._style)
            this._style = new CSSStyleDeclaration(this);
          return this._style;
        } }
      }
    });
    define({
      name: "SVGSVGElement",
      ctor: function SVGSVGElement(doc, localName, prefix) {
        SVGElement.call(this, doc, localName, prefix);
      },
      tag: "svg",
      props: {
        createSVGRect: { value: function() {
          return exports2.createElement(this.ownerDocument, "rect", null);
        } }
      }
    });
    define({
      tags: [
        "a",
        "altGlyph",
        "altGlyphDef",
        "altGlyphItem",
        "animate",
        "animateColor",
        "animateMotion",
        "animateTransform",
        "circle",
        "clipPath",
        "color-profile",
        "cursor",
        "defs",
        "desc",
        "ellipse",
        "feBlend",
        "feColorMatrix",
        "feComponentTransfer",
        "feComposite",
        "feConvolveMatrix",
        "feDiffuseLighting",
        "feDisplacementMap",
        "feDistantLight",
        "feFlood",
        "feFuncA",
        "feFuncB",
        "feFuncG",
        "feFuncR",
        "feGaussianBlur",
        "feImage",
        "feMerge",
        "feMergeNode",
        "feMorphology",
        "feOffset",
        "fePointLight",
        "feSpecularLighting",
        "feSpotLight",
        "feTile",
        "feTurbulence",
        "filter",
        "font",
        "font-face",
        "font-face-format",
        "font-face-name",
        "font-face-src",
        "font-face-uri",
        "foreignObject",
        "g",
        "glyph",
        "glyphRef",
        "hkern",
        "image",
        "line",
        "linearGradient",
        "marker",
        "mask",
        "metadata",
        "missing-glyph",
        "mpath",
        "path",
        "pattern",
        "polygon",
        "polyline",
        "radialGradient",
        "rect",
        "script",
        "set",
        "stop",
        "style",
        "switch",
        "symbol",
        "text",
        "textPath",
        "title",
        "tref",
        "tspan",
        "use",
        "view",
        "vkern"
      ]
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/MutationConstants.js
var require_MutationConstants = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/MutationConstants.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      VALUE: 1,
      // The value of a Text, Comment or PI node changed
      ATTR: 2,
      // A new attribute was added or an attribute value and/or prefix changed
      REMOVE_ATTR: 3,
      // An attribute was removed
      REMOVE: 4,
      // A node was removed
      MOVE: 5,
      // A node was moved
      INSERT: 6
      // A node (or a subtree of nodes) was inserted
    };
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Document.js
var require_Document = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Document.js"(exports2, module2) {
    "use strict";
    module2.exports = Document;
    var Node = require_Node();
    var NodeList = require_NodeList();
    var ContainerNode = require_ContainerNode();
    var Element = require_Element();
    var Text = require_Text();
    var Comment = require_Comment();
    var Event = require_Event();
    var DocumentFragment = require_DocumentFragment();
    var ProcessingInstruction = require_ProcessingInstruction();
    var DOMImplementation = require_DOMImplementation();
    var TreeWalker = require_TreeWalker();
    var NodeIterator = require_NodeIterator();
    var NodeFilter = require_NodeFilter();
    var URL2 = require_URL();
    var select = require_select();
    var events = require_events();
    var xml = require_xmlnames();
    var html = require_htmlelts();
    var svg = require_svg();
    var utils = require_utils();
    var MUTATE = require_MutationConstants();
    var NAMESPACE = utils.NAMESPACE;
    var isApiWritable = require_config().isApiWritable;
    function Document(isHTML, address) {
      ContainerNode.call(this);
      this.nodeType = Node.DOCUMENT_NODE;
      this.isHTML = isHTML;
      this._address = address || "about:blank";
      this.readyState = "loading";
      this.implementation = new DOMImplementation(this);
      this.ownerDocument = null;
      this._contentType = isHTML ? "text/html" : "application/xml";
      this.doctype = null;
      this.documentElement = null;
      this._templateDocCache = null;
      this._nodeIterators = null;
      this._nid = 1;
      this._nextnid = 2;
      this._nodes = [null, this];
      this.byId = /* @__PURE__ */ Object.create(null);
      this.modclock = 0;
    }
    var supportedEvents = {
      event: "Event",
      customevent: "CustomEvent",
      uievent: "UIEvent",
      mouseevent: "MouseEvent"
    };
    var replacementEvent = {
      events: "event",
      htmlevents: "event",
      mouseevents: "mouseevent",
      mutationevents: "mutationevent",
      uievents: "uievent"
    };
    var mirrorAttr = function(f, name, defaultValue) {
      return {
        get: function() {
          var o = f.call(this);
          if (o) {
            return o[name];
          }
          return defaultValue;
        },
        set: function(value) {
          var o = f.call(this);
          if (o) {
            o[name] = value;
          }
        }
      };
    };
    function validateAndExtract(namespace, qualifiedName) {
      var prefix, localName, pos;
      if (namespace === "") {
        namespace = null;
      }
      if (!xml.isValidQName(qualifiedName)) {
        utils.InvalidCharacterError();
      }
      prefix = null;
      localName = qualifiedName;
      pos = qualifiedName.indexOf(":");
      if (pos >= 0) {
        prefix = qualifiedName.substring(0, pos);
        localName = qualifiedName.substring(pos + 1);
      }
      if (prefix !== null && namespace === null) {
        utils.NamespaceError();
      }
      if (prefix === "xml" && namespace !== NAMESPACE.XML) {
        utils.NamespaceError();
      }
      if ((prefix === "xmlns" || qualifiedName === "xmlns") && namespace !== NAMESPACE.XMLNS) {
        utils.NamespaceError();
      }
      if (namespace === NAMESPACE.XMLNS && !(prefix === "xmlns" || qualifiedName === "xmlns")) {
        utils.NamespaceError();
      }
      return { namespace, prefix, localName };
    }
    Document.prototype = Object.create(ContainerNode.prototype, {
      // This method allows dom.js to communicate with a renderer
      // that displays the document in some way
      // XXX: I should probably move this to the window object
      _setMutationHandler: { value: function(handler) {
        this.mutationHandler = handler;
      } },
      // This method allows dom.js to receive event notifications
      // from the renderer.
      // XXX: I should probably move this to the window object
      _dispatchRendererEvent: { value: function(targetNid, type, details) {
        var target = this._nodes[targetNid];
        if (!target) return;
        target._dispatchEvent(new Event(type, details), true);
      } },
      nodeName: { value: "#document" },
      nodeValue: {
        get: function() {
          return null;
        },
        set: function() {
        }
      },
      // XXX: DOMCore may remove documentURI, so it is NYI for now
      documentURI: { get: function() {
        return this._address;
      }, set: utils.nyi },
      compatMode: { get: function() {
        return this._quirks ? "BackCompat" : "CSS1Compat";
      } },
      createTextNode: { value: function(data) {
        return new Text(this, String(data));
      } },
      createComment: { value: function(data) {
        return new Comment(this, data);
      } },
      createDocumentFragment: { value: function() {
        return new DocumentFragment(this);
      } },
      createProcessingInstruction: { value: function(target, data) {
        if (!xml.isValidName(target) || data.indexOf("?>") !== -1)
          utils.InvalidCharacterError();
        return new ProcessingInstruction(this, target, data);
      } },
      createAttribute: { value: function(localName) {
        localName = String(localName);
        if (!xml.isValidName(localName)) utils.InvalidCharacterError();
        if (this.isHTML) {
          localName = utils.toASCIILowerCase(localName);
        }
        return new Element._Attr(null, localName, null, null, "");
      } },
      createAttributeNS: { value: function(namespace, qualifiedName) {
        namespace = namespace === null || namespace === void 0 || namespace === "" ? null : String(namespace);
        qualifiedName = String(qualifiedName);
        var ve = validateAndExtract(namespace, qualifiedName);
        return new Element._Attr(null, ve.localName, ve.prefix, ve.namespace, "");
      } },
      createElement: { value: function(localName) {
        localName = String(localName);
        if (!xml.isValidName(localName)) utils.InvalidCharacterError();
        if (this.isHTML) {
          if (/[A-Z]/.test(localName))
            localName = utils.toASCIILowerCase(localName);
          return html.createElement(this, localName, null);
        } else if (this.contentType === "application/xhtml+xml") {
          return html.createElement(this, localName, null);
        } else {
          return new Element(this, localName, null, null);
        }
      }, writable: isApiWritable },
      createElementNS: { value: function(namespace, qualifiedName) {
        namespace = namespace === null || namespace === void 0 || namespace === "" ? null : String(namespace);
        qualifiedName = String(qualifiedName);
        var ve = validateAndExtract(namespace, qualifiedName);
        return this._createElementNS(ve.localName, ve.namespace, ve.prefix);
      }, writable: isApiWritable },
      // This is used directly by HTML parser, which allows it to create
      // elements with localNames containing ':' and non-default namespaces
      _createElementNS: { value: function(localName, namespace, prefix) {
        if (namespace === NAMESPACE.HTML) {
          return html.createElement(this, localName, prefix);
        } else if (namespace === NAMESPACE.SVG) {
          return svg.createElement(this, localName, prefix);
        }
        return new Element(this, localName, namespace, prefix);
      } },
      createEvent: { value: function createEvent(interfaceName) {
        interfaceName = interfaceName.toLowerCase();
        var name = replacementEvent[interfaceName] || interfaceName;
        var constructor = events[supportedEvents[name]];
        if (constructor) {
          var e = new constructor();
          e._initialized = false;
          return e;
        } else {
          utils.NotSupportedError();
        }
      } },
      // See: http://www.w3.org/TR/dom/#dom-document-createtreewalker
      createTreeWalker: { value: function(root2, whatToShow, filter) {
        if (!root2) {
          throw new TypeError("root argument is required");
        }
        if (!(root2 instanceof Node)) {
          throw new TypeError("root not a node");
        }
        whatToShow = whatToShow === void 0 ? NodeFilter.SHOW_ALL : +whatToShow;
        filter = filter === void 0 ? null : filter;
        return new TreeWalker(root2, whatToShow, filter);
      } },
      // See: http://www.w3.org/TR/dom/#dom-document-createnodeiterator
      createNodeIterator: { value: function(root2, whatToShow, filter) {
        if (!root2) {
          throw new TypeError("root argument is required");
        }
        if (!(root2 instanceof Node)) {
          throw new TypeError("root not a node");
        }
        whatToShow = whatToShow === void 0 ? NodeFilter.SHOW_ALL : +whatToShow;
        filter = filter === void 0 ? null : filter;
        return new NodeIterator(root2, whatToShow, filter);
      } },
      _attachNodeIterator: { value: function(ni) {
        if (!this._nodeIterators) {
          this._nodeIterators = [];
        }
        this._nodeIterators.push(ni);
      } },
      _detachNodeIterator: { value: function(ni) {
        var idx = this._nodeIterators.indexOf(ni);
        this._nodeIterators.splice(idx, 1);
      } },
      _preremoveNodeIterators: { value: function(toBeRemoved) {
        if (this._nodeIterators) {
          this._nodeIterators.forEach(function(ni) {
            ni._preremove(toBeRemoved);
          });
        }
      } },
      // Maintain the documentElement and
      // doctype properties of the document.  Each of the following
      // methods chains to the Node implementation of the method
      // to do the actual inserting, removal or replacement.
      _updateDocTypeElement: { value: function _updateDocTypeElement() {
        this.doctype = this.documentElement = null;
        for (var kid = this.firstChild; kid !== null; kid = kid.nextSibling) {
          if (kid.nodeType === Node.DOCUMENT_TYPE_NODE)
            this.doctype = kid;
          else if (kid.nodeType === Node.ELEMENT_NODE)
            this.documentElement = kid;
        }
      } },
      insertBefore: { value: function insertBefore(child, refChild) {
        Node.prototype.insertBefore.call(this, child, refChild);
        this._updateDocTypeElement();
        return child;
      } },
      replaceChild: { value: function replaceChild(node, child) {
        Node.prototype.replaceChild.call(this, node, child);
        this._updateDocTypeElement();
        return child;
      } },
      removeChild: { value: function removeChild(child) {
        Node.prototype.removeChild.call(this, child);
        this._updateDocTypeElement();
        return child;
      } },
      getElementById: { value: function(id) {
        var n = this.byId[id];
        if (!n) return null;
        if (n instanceof MultiId) {
          return n.getFirst();
        }
        return n;
      } },
      _hasMultipleElementsWithId: { value: function(id) {
        return this.byId[id] instanceof MultiId;
      } },
      // Just copy this method from the Element prototype
      getElementsByName: { value: Element.prototype.getElementsByName },
      getElementsByTagName: { value: Element.prototype.getElementsByTagName },
      getElementsByTagNameNS: { value: Element.prototype.getElementsByTagNameNS },
      getElementsByClassName: { value: Element.prototype.getElementsByClassName },
      adoptNode: { value: function adoptNode(node) {
        if (node.nodeType === Node.DOCUMENT_NODE) utils.NotSupportedError();
        if (node.nodeType === Node.ATTRIBUTE_NODE) {
          return node;
        }
        if (node.parentNode) node.parentNode.removeChild(node);
        if (node.ownerDocument !== this)
          recursivelySetOwner(node, this);
        return node;
      } },
      importNode: { value: function importNode(node, deep) {
        return this.adoptNode(node.cloneNode(deep));
      }, writable: isApiWritable },
      // The following attributes and methods are from the HTML spec
      origin: { get: function origin() {
        return null;
      } },
      characterSet: { get: function characterSet() {
        return "UTF-8";
      } },
      contentType: { get: function contentType() {
        return this._contentType;
      } },
      URL: { get: function URL3() {
        return this._address;
      } },
      domain: { get: utils.nyi, set: utils.nyi },
      referrer: { get: utils.nyi },
      cookie: { get: utils.nyi, set: utils.nyi },
      lastModified: { get: utils.nyi },
      location: {
        get: function() {
          return this.defaultView ? this.defaultView.location : null;
        },
        set: utils.nyi
      },
      _titleElement: {
        get: function() {
          return this.getElementsByTagName("title").item(0) || null;
        }
      },
      title: {
        get: function() {
          var elt = this._titleElement;
          var value = elt ? elt.textContent : "";
          return value.replace(/[ \t\n\r\f]+/g, " ").replace(/(^ )|( $)/g, "");
        },
        set: function(value) {
          var elt = this._titleElement;
          var head = this.head;
          if (!elt && !head) {
            return;
          }
          if (!elt) {
            elt = this.createElement("title");
            head.appendChild(elt);
          }
          elt.textContent = value;
        }
      },
      dir: mirrorAttr(function() {
        var htmlElement = this.documentElement;
        if (htmlElement && htmlElement.tagName === "HTML") {
          return htmlElement;
        }
      }, "dir", ""),
      fgColor: mirrorAttr(function() {
        return this.body;
      }, "text", ""),
      linkColor: mirrorAttr(function() {
        return this.body;
      }, "link", ""),
      vlinkColor: mirrorAttr(function() {
        return this.body;
      }, "vLink", ""),
      alinkColor: mirrorAttr(function() {
        return this.body;
      }, "aLink", ""),
      bgColor: mirrorAttr(function() {
        return this.body;
      }, "bgColor", ""),
      // Historical aliases of Document#characterSet
      charset: { get: function() {
        return this.characterSet;
      } },
      inputEncoding: { get: function() {
        return this.characterSet;
      } },
      scrollingElement: {
        get: function() {
          return this._quirks ? this.body : this.documentElement;
        }
      },
      // Return the first <body> child of the document element.
      // XXX For now, setting this attribute is not implemented.
      body: {
        get: function() {
          return namedHTMLChild(this.documentElement, "body");
        },
        set: utils.nyi
      },
      // Return the first <head> child of the document element.
      head: { get: function() {
        return namedHTMLChild(this.documentElement, "head");
      } },
      images: { get: utils.nyi },
      embeds: { get: utils.nyi },
      plugins: { get: utils.nyi },
      links: { get: utils.nyi },
      forms: { get: utils.nyi },
      scripts: { get: utils.nyi },
      applets: { get: function() {
        return [];
      } },
      activeElement: { get: function() {
        return null;
      } },
      innerHTML: {
        get: function() {
          return this.serialize();
        },
        set: utils.nyi
      },
      outerHTML: {
        get: function() {
          return this.serialize();
        },
        set: utils.nyi
      },
      write: { value: function(args) {
        if (!this.isHTML) utils.InvalidStateError();
        if (!this._parser)
          return;
        if (!this._parser) {
        }
        var s = arguments.join("");
        this._parser.parse(s);
      } },
      writeln: { value: function writeln(args) {
        this.write(Array.prototype.join.call(arguments, "") + "\n");
      } },
      open: { value: function() {
        this.documentElement = null;
      } },
      close: { value: function() {
        this.readyState = "interactive";
        this._dispatchEvent(new Event("readystatechange"), true);
        this._dispatchEvent(new Event("DOMContentLoaded"), true);
        this.readyState = "complete";
        this._dispatchEvent(new Event("readystatechange"), true);
        if (this.defaultView) {
          this.defaultView._dispatchEvent(new Event("load"), true);
        }
      } },
      // Utility methods
      clone: { value: function clone() {
        var d = new Document(this.isHTML, this._address);
        d._quirks = this._quirks;
        d._contentType = this._contentType;
        return d;
      } },
      // We need to adopt the nodes if we do a deep clone
      cloneNode: { value: function cloneNode(deep) {
        var clone = Node.prototype.cloneNode.call(this, false);
        if (deep) {
          for (var kid = this.firstChild; kid !== null; kid = kid.nextSibling) {
            clone._appendChild(clone.importNode(kid, true));
          }
        }
        clone._updateDocTypeElement();
        return clone;
      } },
      isEqual: { value: function isEqual(n) {
        return true;
      } },
      // Implementation-specific function.  Called when a text, comment,
      // or pi value changes.
      mutateValue: { value: function(node) {
        if (this.mutationHandler) {
          this.mutationHandler({
            type: MUTATE.VALUE,
            target: node,
            data: node.data
          });
        }
      } },
      // Invoked when an attribute's value changes. Attr holds the new
      // value.  oldval is the old value.  Attribute mutations can also
      // involve changes to the prefix (and therefore the qualified name)
      mutateAttr: { value: function(attr, oldval) {
        if (this.mutationHandler) {
          this.mutationHandler({
            type: MUTATE.ATTR,
            target: attr.ownerElement,
            attr
          });
        }
      } },
      // Used by removeAttribute and removeAttributeNS for attributes.
      mutateRemoveAttr: { value: function(attr) {
        if (this.mutationHandler) {
          this.mutationHandler({
            type: MUTATE.REMOVE_ATTR,
            target: attr.ownerElement,
            attr
          });
        }
      } },
      // Called by Node.removeChild, etc. to remove a rooted element from
      // the tree. Only needs to generate a single mutation event when a
      // node is removed, but must recursively mark all descendants as not
      // rooted.
      mutateRemove: { value: function(node) {
        if (this.mutationHandler) {
          this.mutationHandler({
            type: MUTATE.REMOVE,
            target: node.parentNode,
            node
          });
        }
        recursivelyUproot(node);
      } },
      // Called when a new element becomes rooted.  It must recursively
      // generate mutation events for each of the children, and mark them all
      // as rooted.
      mutateInsert: { value: function(node) {
        recursivelyRoot(node);
        if (this.mutationHandler) {
          this.mutationHandler({
            type: MUTATE.INSERT,
            target: node.parentNode,
            node
          });
        }
      } },
      // Called when a rooted element is moved within the document
      mutateMove: { value: function(node) {
        if (this.mutationHandler) {
          this.mutationHandler({
            type: MUTATE.MOVE,
            target: node
          });
        }
      } },
      // Add a mapping from  id to n for n.ownerDocument
      addId: { value: function addId(id, n) {
        var val = this.byId[id];
        if (!val) {
          this.byId[id] = n;
        } else {
          if (!(val instanceof MultiId)) {
            val = new MultiId(val);
            this.byId[id] = val;
          }
          val.add(n);
        }
      } },
      // Delete the mapping from id to n for n.ownerDocument
      delId: { value: function delId(id, n) {
        var val = this.byId[id];
        utils.assert(val);
        if (val instanceof MultiId) {
          val.del(n);
          if (val.length === 1) {
            this.byId[id] = val.downgrade();
          }
        } else {
          this.byId[id] = void 0;
        }
      } },
      _resolve: { value: function(href) {
        return new URL2(this._documentBaseURL).resolve(href);
      } },
      _documentBaseURL: { get: function() {
        var url = this._address;
        if (url === "about:blank") url = "/";
        var base = this.querySelector("base[href]");
        if (base) {
          return new URL2(url).resolve(base.getAttribute("href"));
        }
        return url;
      } },
      _templateDoc: { get: function() {
        if (!this._templateDocCache) {
          var newDoc = new Document(this.isHTML, this._address);
          this._templateDocCache = newDoc._templateDocCache = newDoc;
        }
        return this._templateDocCache;
      } },
      querySelector: { value: function(selector) {
        return select(selector, this)[0];
      } },
      querySelectorAll: { value: function(selector) {
        var nodes = select(selector, this);
        return nodes.item ? nodes : new NodeList(nodes);
      } }
    });
    var eventHandlerTypes = [
      "abort",
      "canplay",
      "canplaythrough",
      "change",
      "click",
      "contextmenu",
      "cuechange",
      "dblclick",
      "drag",
      "dragend",
      "dragenter",
      "dragleave",
      "dragover",
      "dragstart",
      "drop",
      "durationchange",
      "emptied",
      "ended",
      "input",
      "invalid",
      "keydown",
      "keypress",
      "keyup",
      "loadeddata",
      "loadedmetadata",
      "loadstart",
      "mousedown",
      "mousemove",
      "mouseout",
      "mouseover",
      "mouseup",
      "mousewheel",
      "pause",
      "play",
      "playing",
      "progress",
      "ratechange",
      "readystatechange",
      "reset",
      "seeked",
      "seeking",
      "select",
      "show",
      "stalled",
      "submit",
      "suspend",
      "timeupdate",
      "volumechange",
      "waiting",
      "blur",
      "error",
      "focus",
      "load",
      "scroll"
    ];
    eventHandlerTypes.forEach(function(type) {
      Object.defineProperty(Document.prototype, "on" + type, {
        get: function() {
          return this._getEventHandler(type);
        },
        set: function(v) {
          this._setEventHandler(type, v);
        }
      });
    });
    function namedHTMLChild(parent, name) {
      if (parent && parent.isHTML) {
        for (var kid = parent.firstChild; kid !== null; kid = kid.nextSibling) {
          if (kid.nodeType === Node.ELEMENT_NODE && kid.localName === name && kid.namespaceURI === NAMESPACE.HTML) {
            return kid;
          }
        }
      }
      return null;
    }
    function root(n) {
      n._nid = n.ownerDocument._nextnid++;
      n.ownerDocument._nodes[n._nid] = n;
      if (n.nodeType === Node.ELEMENT_NODE) {
        var id = n.getAttribute("id");
        if (id) n.ownerDocument.addId(id, n);
        if (n._roothook) n._roothook();
      }
    }
    function uproot(n) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        var id = n.getAttribute("id");
        if (id) n.ownerDocument.delId(id, n);
      }
      n.ownerDocument._nodes[n._nid] = void 0;
      n._nid = void 0;
    }
    function recursivelyRoot(node) {
      root(node);
      if (node.nodeType === Node.ELEMENT_NODE) {
        for (var kid = node.firstChild; kid !== null; kid = kid.nextSibling)
          recursivelyRoot(kid);
      }
    }
    function recursivelyUproot(node) {
      uproot(node);
      for (var kid = node.firstChild; kid !== null; kid = kid.nextSibling)
        recursivelyUproot(kid);
    }
    function recursivelySetOwner(node, owner) {
      node.ownerDocument = owner;
      node._lastModTime = void 0;
      if (Object.prototype.hasOwnProperty.call(node, "_tagName")) {
        node._tagName = void 0;
      }
      for (var kid = node.firstChild; kid !== null; kid = kid.nextSibling)
        recursivelySetOwner(kid, owner);
    }
    function MultiId(node) {
      this.nodes = /* @__PURE__ */ Object.create(null);
      this.nodes[node._nid] = node;
      this.length = 1;
      this.firstNode = void 0;
    }
    MultiId.prototype.add = function(node) {
      if (!this.nodes[node._nid]) {
        this.nodes[node._nid] = node;
        this.length++;
        this.firstNode = void 0;
      }
    };
    MultiId.prototype.del = function(node) {
      if (this.nodes[node._nid]) {
        delete this.nodes[node._nid];
        this.length--;
        this.firstNode = void 0;
      }
    };
    MultiId.prototype.getFirst = function() {
      if (!this.firstNode) {
        var nid;
        for (nid in this.nodes) {
          if (this.firstNode === void 0 || this.firstNode.compareDocumentPosition(this.nodes[nid]) & Node.DOCUMENT_POSITION_PRECEDING) {
            this.firstNode = this.nodes[nid];
          }
        }
      }
      return this.firstNode;
    };
    MultiId.prototype.downgrade = function() {
      if (this.length === 1) {
        var nid;
        for (nid in this.nodes) {
          return this.nodes[nid];
        }
      }
      return this;
    };
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/DocumentType.js
var require_DocumentType = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/DocumentType.js"(exports2, module2) {
    "use strict";
    module2.exports = DocumentType;
    var Node = require_Node();
    var Leaf = require_Leaf();
    var ChildNode = require_ChildNode();
    function DocumentType(ownerDocument, name, publicId, systemId) {
      Leaf.call(this);
      this.nodeType = Node.DOCUMENT_TYPE_NODE;
      this.ownerDocument = ownerDocument || null;
      this.name = name;
      this.publicId = publicId || "";
      this.systemId = systemId || "";
    }
    DocumentType.prototype = Object.create(Leaf.prototype, {
      nodeName: { get: function() {
        return this.name;
      } },
      nodeValue: {
        get: function() {
          return null;
        },
        set: function() {
        }
      },
      // Utility methods
      clone: { value: function clone() {
        return new DocumentType(this.ownerDocument, this.name, this.publicId, this.systemId);
      } },
      isEqual: { value: function isEqual(n) {
        return this.name === n.name && this.publicId === n.publicId && this.systemId === n.systemId;
      } }
    });
    Object.defineProperties(DocumentType.prototype, ChildNode);
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/HTMLParser.js
var require_HTMLParser = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/HTMLParser.js"(exports2, module2) {
    "use strict";
    module2.exports = HTMLParser;
    var Document = require_Document();
    var DocumentType = require_DocumentType();
    var Node = require_Node();
    var NAMESPACE = require_utils().NAMESPACE;
    var html = require_htmlelts();
    var impl = html.elements;
    var pushAll = Function.prototype.apply.bind(Array.prototype.push);
    var EOF = -1;
    var TEXT = 1;
    var TAG = 2;
    var ENDTAG = 3;
    var COMMENT = 4;
    var DOCTYPE = 5;
    var NOATTRS = [];
    var quirkyPublicIds = /^HTML$|^-\/\/W3O\/\/DTD W3 HTML Strict 3\.0\/\/EN\/\/$|^-\/W3C\/DTD HTML 4\.0 Transitional\/EN$|^\+\/\/Silmaril\/\/dtd html Pro v0r11 19970101\/\/|^-\/\/AdvaSoft Ltd\/\/DTD HTML 3\.0 asWedit \+ extensions\/\/|^-\/\/AS\/\/DTD HTML 3\.0 asWedit \+ extensions\/\/|^-\/\/IETF\/\/DTD HTML 2\.0 Level 1\/\/|^-\/\/IETF\/\/DTD HTML 2\.0 Level 2\/\/|^-\/\/IETF\/\/DTD HTML 2\.0 Strict Level 1\/\/|^-\/\/IETF\/\/DTD HTML 2\.0 Strict Level 2\/\/|^-\/\/IETF\/\/DTD HTML 2\.0 Strict\/\/|^-\/\/IETF\/\/DTD HTML 2\.0\/\/|^-\/\/IETF\/\/DTD HTML 2\.1E\/\/|^-\/\/IETF\/\/DTD HTML 3\.0\/\/|^-\/\/IETF\/\/DTD HTML 3\.2 Final\/\/|^-\/\/IETF\/\/DTD HTML 3\.2\/\/|^-\/\/IETF\/\/DTD HTML 3\/\/|^-\/\/IETF\/\/DTD HTML Level 0\/\/|^-\/\/IETF\/\/DTD HTML Level 1\/\/|^-\/\/IETF\/\/DTD HTML Level 2\/\/|^-\/\/IETF\/\/DTD HTML Level 3\/\/|^-\/\/IETF\/\/DTD HTML Strict Level 0\/\/|^-\/\/IETF\/\/DTD HTML Strict Level 1\/\/|^-\/\/IETF\/\/DTD HTML Strict Level 2\/\/|^-\/\/IETF\/\/DTD HTML Strict Level 3\/\/|^-\/\/IETF\/\/DTD HTML Strict\/\/|^-\/\/IETF\/\/DTD HTML\/\/|^-\/\/Metrius\/\/DTD Metrius Presentational\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 2\.0 HTML Strict\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 2\.0 HTML\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 2\.0 Tables\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 3\.0 HTML Strict\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 3\.0 HTML\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 3\.0 Tables\/\/|^-\/\/Netscape Comm\. Corp\.\/\/DTD HTML\/\/|^-\/\/Netscape Comm\. Corp\.\/\/DTD Strict HTML\/\/|^-\/\/O'Reilly and Associates\/\/DTD HTML 2\.0\/\/|^-\/\/O'Reilly and Associates\/\/DTD HTML Extended 1\.0\/\/|^-\/\/O'Reilly and Associates\/\/DTD HTML Extended Relaxed 1\.0\/\/|^-\/\/SoftQuad Software\/\/DTD HoTMetaL PRO 6\.0::19990601::extensions to HTML 4\.0\/\/|^-\/\/SoftQuad\/\/DTD HoTMetaL PRO 4\.0::19971010::extensions to HTML 4\.0\/\/|^-\/\/Spyglass\/\/DTD HTML 2\.0 Extended\/\/|^-\/\/SQ\/\/DTD HTML 2\.0 HoTMetaL \+ extensions\/\/|^-\/\/Sun Microsystems Corp\.\/\/DTD HotJava HTML\/\/|^-\/\/Sun Microsystems Corp\.\/\/DTD HotJava Strict HTML\/\/|^-\/\/W3C\/\/DTD HTML 3 1995-03-24\/\/|^-\/\/W3C\/\/DTD HTML 3\.2 Draft\/\/|^-\/\/W3C\/\/DTD HTML 3\.2 Final\/\/|^-\/\/W3C\/\/DTD HTML 3\.2\/\/|^-\/\/W3C\/\/DTD HTML 3\.2S Draft\/\/|^-\/\/W3C\/\/DTD HTML 4\.0 Frameset\/\/|^-\/\/W3C\/\/DTD HTML 4\.0 Transitional\/\/|^-\/\/W3C\/\/DTD HTML Experimental 19960712\/\/|^-\/\/W3C\/\/DTD HTML Experimental 970421\/\/|^-\/\/W3C\/\/DTD W3 HTML\/\/|^-\/\/W3O\/\/DTD W3 HTML 3\.0\/\/|^-\/\/WebTechs\/\/DTD Mozilla HTML 2\.0\/\/|^-\/\/WebTechs\/\/DTD Mozilla HTML\/\//i;
    var quirkySystemId = "http://www.ibm.com/data/dtd/v11/ibmxhtml1-transitional.dtd";
    var conditionallyQuirkyPublicIds = /^-\/\/W3C\/\/DTD HTML 4\.01 Frameset\/\/|^-\/\/W3C\/\/DTD HTML 4\.01 Transitional\/\//i;
    var limitedQuirkyPublicIds = /^-\/\/W3C\/\/DTD XHTML 1\.0 Frameset\/\/|^-\/\/W3C\/\/DTD XHTML 1\.0 Transitional\/\//i;
    var specialSet = /* @__PURE__ */ Object.create(null);
    specialSet[NAMESPACE.HTML] = {
      __proto__: null,
      "address": true,
      "applet": true,
      "area": true,
      "article": true,
      "aside": true,
      "base": true,
      "basefont": true,
      "bgsound": true,
      "blockquote": true,
      "body": true,
      "br": true,
      "button": true,
      "caption": true,
      "center": true,
      "col": true,
      "colgroup": true,
      "dd": true,
      "details": true,
      "dir": true,
      "div": true,
      "dl": true,
      "dt": true,
      "embed": true,
      "fieldset": true,
      "figcaption": true,
      "figure": true,
      "footer": true,
      "form": true,
      "frame": true,
      "frameset": true,
      "h1": true,
      "h2": true,
      "h3": true,
      "h4": true,
      "h5": true,
      "h6": true,
      "head": true,
      "header": true,
      "hgroup": true,
      "hr": true,
      "html": true,
      "iframe": true,
      "img": true,
      "input": true,
      "li": true,
      "link": true,
      "listing": true,
      "main": true,
      "marquee": true,
      "menu": true,
      "meta": true,
      "nav": true,
      "noembed": true,
      "noframes": true,
      "noscript": true,
      "object": true,
      "ol": true,
      "p": true,
      "param": true,
      "plaintext": true,
      "pre": true,
      "script": true,
      "section": true,
      "select": true,
      "source": true,
      "style": true,
      "summary": true,
      "table": true,
      "tbody": true,
      "td": true,
      "template": true,
      "textarea": true,
      "tfoot": true,
      "th": true,
      "thead": true,
      "title": true,
      "tr": true,
      "track": true,
      // Note that "xmp" was removed from the "special" set in the latest
      // spec, apparently by accident; see
      // https://github.com/whatwg/html/pull/1919
      "ul": true,
      "wbr": true,
      "xmp": true
    };
    specialSet[NAMESPACE.SVG] = {
      __proto__: null,
      "foreignObject": true,
      "desc": true,
      "title": true
    };
    specialSet[NAMESPACE.MATHML] = {
      __proto__: null,
      "mi": true,
      "mo": true,
      "mn": true,
      "ms": true,
      "mtext": true,
      "annotation-xml": true
    };
    var addressdivpSet = /* @__PURE__ */ Object.create(null);
    addressdivpSet[NAMESPACE.HTML] = {
      __proto__: null,
      "address": true,
      "div": true,
      "p": true
    };
    var dddtSet = /* @__PURE__ */ Object.create(null);
    dddtSet[NAMESPACE.HTML] = {
      __proto__: null,
      "dd": true,
      "dt": true
    };
    var tablesectionrowSet = /* @__PURE__ */ Object.create(null);
    tablesectionrowSet[NAMESPACE.HTML] = {
      __proto__: null,
      "table": true,
      "thead": true,
      "tbody": true,
      "tfoot": true,
      "tr": true
    };
    var impliedEndTagsSet = /* @__PURE__ */ Object.create(null);
    impliedEndTagsSet[NAMESPACE.HTML] = {
      __proto__: null,
      "dd": true,
      "dt": true,
      "li": true,
      "menuitem": true,
      "optgroup": true,
      "option": true,
      "p": true,
      "rb": true,
      "rp": true,
      "rt": true,
      "rtc": true
    };
    var thoroughImpliedEndTagsSet = /* @__PURE__ */ Object.create(null);
    thoroughImpliedEndTagsSet[NAMESPACE.HTML] = {
      __proto__: null,
      "caption": true,
      "colgroup": true,
      "dd": true,
      "dt": true,
      "li": true,
      "optgroup": true,
      "option": true,
      "p": true,
      "rb": true,
      "rp": true,
      "rt": true,
      "rtc": true,
      "tbody": true,
      "td": true,
      "tfoot": true,
      "th": true,
      "thead": true,
      "tr": true
    };
    var tableContextSet = /* @__PURE__ */ Object.create(null);
    tableContextSet[NAMESPACE.HTML] = {
      __proto__: null,
      "table": true,
      "template": true,
      "html": true
    };
    var tableBodyContextSet = /* @__PURE__ */ Object.create(null);
    tableBodyContextSet[NAMESPACE.HTML] = {
      __proto__: null,
      "tbody": true,
      "tfoot": true,
      "thead": true,
      "template": true,
      "html": true
    };
    var tableRowContextSet = /* @__PURE__ */ Object.create(null);
    tableRowContextSet[NAMESPACE.HTML] = {
      __proto__: null,
      "tr": true,
      "template": true,
      "html": true
    };
    var formassociatedSet = /* @__PURE__ */ Object.create(null);
    formassociatedSet[NAMESPACE.HTML] = {
      __proto__: null,
      "button": true,
      "fieldset": true,
      "input": true,
      "keygen": true,
      "object": true,
      "output": true,
      "select": true,
      "textarea": true,
      "img": true
    };
    var inScopeSet = /* @__PURE__ */ Object.create(null);
    inScopeSet[NAMESPACE.HTML] = {
      __proto__: null,
      "applet": true,
      "caption": true,
      "html": true,
      "table": true,
      "td": true,
      "th": true,
      "marquee": true,
      "object": true,
      "template": true
    };
    inScopeSet[NAMESPACE.MATHML] = {
      __proto__: null,
      "mi": true,
      "mo": true,
      "mn": true,
      "ms": true,
      "mtext": true,
      "annotation-xml": true
    };
    inScopeSet[NAMESPACE.SVG] = {
      __proto__: null,
      "foreignObject": true,
      "desc": true,
      "title": true
    };
    var inListItemScopeSet = Object.create(inScopeSet);
    inListItemScopeSet[NAMESPACE.HTML] = Object.create(inScopeSet[NAMESPACE.HTML]);
    inListItemScopeSet[NAMESPACE.HTML].ol = true;
    inListItemScopeSet[NAMESPACE.HTML].ul = true;
    var inButtonScopeSet = Object.create(inScopeSet);
    inButtonScopeSet[NAMESPACE.HTML] = Object.create(inScopeSet[NAMESPACE.HTML]);
    inButtonScopeSet[NAMESPACE.HTML].button = true;
    var inTableScopeSet = /* @__PURE__ */ Object.create(null);
    inTableScopeSet[NAMESPACE.HTML] = {
      __proto__: null,
      "html": true,
      "table": true,
      "template": true
    };
    var invertedSelectScopeSet = /* @__PURE__ */ Object.create(null);
    invertedSelectScopeSet[NAMESPACE.HTML] = {
      __proto__: null,
      "optgroup": true,
      "option": true
    };
    var mathmlTextIntegrationPointSet = /* @__PURE__ */ Object.create(null);
    mathmlTextIntegrationPointSet[NAMESPACE.MATHML] = {
      __proto__: null,
      mi: true,
      mo: true,
      mn: true,
      ms: true,
      mtext: true
    };
    var htmlIntegrationPointSet = /* @__PURE__ */ Object.create(null);
    htmlIntegrationPointSet[NAMESPACE.SVG] = {
      __proto__: null,
      foreignObject: true,
      desc: true,
      title: true
    };
    var foreignAttributes = {
      __proto__: null,
      "xlink:actuate": NAMESPACE.XLINK,
      "xlink:arcrole": NAMESPACE.XLINK,
      "xlink:href": NAMESPACE.XLINK,
      "xlink:role": NAMESPACE.XLINK,
      "xlink:show": NAMESPACE.XLINK,
      "xlink:title": NAMESPACE.XLINK,
      "xlink:type": NAMESPACE.XLINK,
      "xml:base": NAMESPACE.XML,
      "xml:lang": NAMESPACE.XML,
      "xml:space": NAMESPACE.XML,
      "xmlns": NAMESPACE.XMLNS,
      "xmlns:xlink": NAMESPACE.XMLNS
    };
    var svgAttrAdjustments = {
      __proto__: null,
      attributename: "attributeName",
      attributetype: "attributeType",
      basefrequency: "baseFrequency",
      baseprofile: "baseProfile",
      calcmode: "calcMode",
      clippathunits: "clipPathUnits",
      diffuseconstant: "diffuseConstant",
      edgemode: "edgeMode",
      filterunits: "filterUnits",
      glyphref: "glyphRef",
      gradienttransform: "gradientTransform",
      gradientunits: "gradientUnits",
      kernelmatrix: "kernelMatrix",
      kernelunitlength: "kernelUnitLength",
      keypoints: "keyPoints",
      keysplines: "keySplines",
      keytimes: "keyTimes",
      lengthadjust: "lengthAdjust",
      limitingconeangle: "limitingConeAngle",
      markerheight: "markerHeight",
      markerunits: "markerUnits",
      markerwidth: "markerWidth",
      maskcontentunits: "maskContentUnits",
      maskunits: "maskUnits",
      numoctaves: "numOctaves",
      pathlength: "pathLength",
      patterncontentunits: "patternContentUnits",
      patterntransform: "patternTransform",
      patternunits: "patternUnits",
      pointsatx: "pointsAtX",
      pointsaty: "pointsAtY",
      pointsatz: "pointsAtZ",
      preservealpha: "preserveAlpha",
      preserveaspectratio: "preserveAspectRatio",
      primitiveunits: "primitiveUnits",
      refx: "refX",
      refy: "refY",
      repeatcount: "repeatCount",
      repeatdur: "repeatDur",
      requiredextensions: "requiredExtensions",
      requiredfeatures: "requiredFeatures",
      specularconstant: "specularConstant",
      specularexponent: "specularExponent",
      spreadmethod: "spreadMethod",
      startoffset: "startOffset",
      stddeviation: "stdDeviation",
      stitchtiles: "stitchTiles",
      surfacescale: "surfaceScale",
      systemlanguage: "systemLanguage",
      tablevalues: "tableValues",
      targetx: "targetX",
      targety: "targetY",
      textlength: "textLength",
      viewbox: "viewBox",
      viewtarget: "viewTarget",
      xchannelselector: "xChannelSelector",
      ychannelselector: "yChannelSelector",
      zoomandpan: "zoomAndPan"
    };
    var svgTagNameAdjustments = {
      __proto__: null,
      altglyph: "altGlyph",
      altglyphdef: "altGlyphDef",
      altglyphitem: "altGlyphItem",
      animatecolor: "animateColor",
      animatemotion: "animateMotion",
      animatetransform: "animateTransform",
      clippath: "clipPath",
      feblend: "feBlend",
      fecolormatrix: "feColorMatrix",
      fecomponenttransfer: "feComponentTransfer",
      fecomposite: "feComposite",
      feconvolvematrix: "feConvolveMatrix",
      fediffuselighting: "feDiffuseLighting",
      fedisplacementmap: "feDisplacementMap",
      fedistantlight: "feDistantLight",
      feflood: "feFlood",
      fefunca: "feFuncA",
      fefuncb: "feFuncB",
      fefuncg: "feFuncG",
      fefuncr: "feFuncR",
      fegaussianblur: "feGaussianBlur",
      feimage: "feImage",
      femerge: "feMerge",
      femergenode: "feMergeNode",
      femorphology: "feMorphology",
      feoffset: "feOffset",
      fepointlight: "fePointLight",
      fespecularlighting: "feSpecularLighting",
      fespotlight: "feSpotLight",
      fetile: "feTile",
      feturbulence: "feTurbulence",
      foreignobject: "foreignObject",
      glyphref: "glyphRef",
      lineargradient: "linearGradient",
      radialgradient: "radialGradient",
      textpath: "textPath"
    };
    var numericCharRefReplacements = {
      __proto__: null,
      0: 65533,
      128: 8364,
      130: 8218,
      131: 402,
      132: 8222,
      133: 8230,
      134: 8224,
      135: 8225,
      136: 710,
      137: 8240,
      138: 352,
      139: 8249,
      140: 338,
      142: 381,
      145: 8216,
      146: 8217,
      147: 8220,
      148: 8221,
      149: 8226,
      150: 8211,
      151: 8212,
      152: 732,
      153: 8482,
      154: 353,
      155: 8250,
      156: 339,
      158: 382,
      159: 376
    };
    var namedCharRefs = {
      __proto__: null,
      "AElig": 198,
      "AElig;": 198,
      "AMP": 38,
      "AMP;": 38,
      "Aacute": 193,
      "Aacute;": 193,
      "Abreve;": 258,
      "Acirc": 194,
      "Acirc;": 194,
      "Acy;": 1040,
      "Afr;": [55349, 56580],
      "Agrave": 192,
      "Agrave;": 192,
      "Alpha;": 913,
      "Amacr;": 256,
      "And;": 10835,
      "Aogon;": 260,
      "Aopf;": [55349, 56632],
      "ApplyFunction;": 8289,
      "Aring": 197,
      "Aring;": 197,
      "Ascr;": [55349, 56476],
      "Assign;": 8788,
      "Atilde": 195,
      "Atilde;": 195,
      "Auml": 196,
      "Auml;": 196,
      "Backslash;": 8726,
      "Barv;": 10983,
      "Barwed;": 8966,
      "Bcy;": 1041,
      "Because;": 8757,
      "Bernoullis;": 8492,
      "Beta;": 914,
      "Bfr;": [55349, 56581],
      "Bopf;": [55349, 56633],
      "Breve;": 728,
      "Bscr;": 8492,
      "Bumpeq;": 8782,
      "CHcy;": 1063,
      "COPY": 169,
      "COPY;": 169,
      "Cacute;": 262,
      "Cap;": 8914,
      "CapitalDifferentialD;": 8517,
      "Cayleys;": 8493,
      "Ccaron;": 268,
      "Ccedil": 199,
      "Ccedil;": 199,
      "Ccirc;": 264,
      "Cconint;": 8752,
      "Cdot;": 266,
      "Cedilla;": 184,
      "CenterDot;": 183,
      "Cfr;": 8493,
      "Chi;": 935,
      "CircleDot;": 8857,
      "CircleMinus;": 8854,
      "CirclePlus;": 8853,
      "CircleTimes;": 8855,
      "ClockwiseContourIntegral;": 8754,
      "CloseCurlyDoubleQuote;": 8221,
      "CloseCurlyQuote;": 8217,
      "Colon;": 8759,
      "Colone;": 10868,
      "Congruent;": 8801,
      "Conint;": 8751,
      "ContourIntegral;": 8750,
      "Copf;": 8450,
      "Coproduct;": 8720,
      "CounterClockwiseContourIntegral;": 8755,
      "Cross;": 10799,
      "Cscr;": [55349, 56478],
      "Cup;": 8915,
      "CupCap;": 8781,
      "DD;": 8517,
      "DDotrahd;": 10513,
      "DJcy;": 1026,
      "DScy;": 1029,
      "DZcy;": 1039,
      "Dagger;": 8225,
      "Darr;": 8609,
      "Dashv;": 10980,
      "Dcaron;": 270,
      "Dcy;": 1044,
      "Del;": 8711,
      "Delta;": 916,
      "Dfr;": [55349, 56583],
      "DiacriticalAcute;": 180,
      "DiacriticalDot;": 729,
      "DiacriticalDoubleAcute;": 733,
      "DiacriticalGrave;": 96,
      "DiacriticalTilde;": 732,
      "Diamond;": 8900,
      "DifferentialD;": 8518,
      "Dopf;": [55349, 56635],
      "Dot;": 168,
      "DotDot;": 8412,
      "DotEqual;": 8784,
      "DoubleContourIntegral;": 8751,
      "DoubleDot;": 168,
      "DoubleDownArrow;": 8659,
      "DoubleLeftArrow;": 8656,
      "DoubleLeftRightArrow;": 8660,
      "DoubleLeftTee;": 10980,
      "DoubleLongLeftArrow;": 10232,
      "DoubleLongLeftRightArrow;": 10234,
      "DoubleLongRightArrow;": 10233,
      "DoubleRightArrow;": 8658,
      "DoubleRightTee;": 8872,
      "DoubleUpArrow;": 8657,
      "DoubleUpDownArrow;": 8661,
      "DoubleVerticalBar;": 8741,
      "DownArrow;": 8595,
      "DownArrowBar;": 10515,
      "DownArrowUpArrow;": 8693,
      "DownBreve;": 785,
      "DownLeftRightVector;": 10576,
      "DownLeftTeeVector;": 10590,
      "DownLeftVector;": 8637,
      "DownLeftVectorBar;": 10582,
      "DownRightTeeVector;": 10591,
      "DownRightVector;": 8641,
      "DownRightVectorBar;": 10583,
      "DownTee;": 8868,
      "DownTeeArrow;": 8615,
      "Downarrow;": 8659,
      "Dscr;": [55349, 56479],
      "Dstrok;": 272,
      "ENG;": 330,
      "ETH": 208,
      "ETH;": 208,
      "Eacute": 201,
      "Eacute;": 201,
      "Ecaron;": 282,
      "Ecirc": 202,
      "Ecirc;": 202,
      "Ecy;": 1069,
      "Edot;": 278,
      "Efr;": [55349, 56584],
      "Egrave": 200,
      "Egrave;": 200,
      "Element;": 8712,
      "Emacr;": 274,
      "EmptySmallSquare;": 9723,
      "EmptyVerySmallSquare;": 9643,
      "Eogon;": 280,
      "Eopf;": [55349, 56636],
      "Epsilon;": 917,
      "Equal;": 10869,
      "EqualTilde;": 8770,
      "Equilibrium;": 8652,
      "Escr;": 8496,
      "Esim;": 10867,
      "Eta;": 919,
      "Euml": 203,
      "Euml;": 203,
      "Exists;": 8707,
      "ExponentialE;": 8519,
      "Fcy;": 1060,
      "Ffr;": [55349, 56585],
      "FilledSmallSquare;": 9724,
      "FilledVerySmallSquare;": 9642,
      "Fopf;": [55349, 56637],
      "ForAll;": 8704,
      "Fouriertrf;": 8497,
      "Fscr;": 8497,
      "GJcy;": 1027,
      "GT": 62,
      "GT;": 62,
      "Gamma;": 915,
      "Gammad;": 988,
      "Gbreve;": 286,
      "Gcedil;": 290,
      "Gcirc;": 284,
      "Gcy;": 1043,
      "Gdot;": 288,
      "Gfr;": [55349, 56586],
      "Gg;": 8921,
      "Gopf;": [55349, 56638],
      "GreaterEqual;": 8805,
      "GreaterEqualLess;": 8923,
      "GreaterFullEqual;": 8807,
      "GreaterGreater;": 10914,
      "GreaterLess;": 8823,
      "GreaterSlantEqual;": 10878,
      "GreaterTilde;": 8819,
      "Gscr;": [55349, 56482],
      "Gt;": 8811,
      "HARDcy;": 1066,
      "Hacek;": 711,
      "Hat;": 94,
      "Hcirc;": 292,
      "Hfr;": 8460,
      "HilbertSpace;": 8459,
      "Hopf;": 8461,
      "HorizontalLine;": 9472,
      "Hscr;": 8459,
      "Hstrok;": 294,
      "HumpDownHump;": 8782,
      "HumpEqual;": 8783,
      "IEcy;": 1045,
      "IJlig;": 306,
      "IOcy;": 1025,
      "Iacute": 205,
      "Iacute;": 205,
      "Icirc": 206,
      "Icirc;": 206,
      "Icy;": 1048,
      "Idot;": 304,
      "Ifr;": 8465,
      "Igrave": 204,
      "Igrave;": 204,
      "Im;": 8465,
      "Imacr;": 298,
      "ImaginaryI;": 8520,
      "Implies;": 8658,
      "Int;": 8748,
      "Integral;": 8747,
      "Intersection;": 8898,
      "InvisibleComma;": 8291,
      "InvisibleTimes;": 8290,
      "Iogon;": 302,
      "Iopf;": [55349, 56640],
      "Iota;": 921,
      "Iscr;": 8464,
      "Itilde;": 296,
      "Iukcy;": 1030,
      "Iuml": 207,
      "Iuml;": 207,
      "Jcirc;": 308,
      "Jcy;": 1049,
      "Jfr;": [55349, 56589],
      "Jopf;": [55349, 56641],
      "Jscr;": [55349, 56485],
      "Jsercy;": 1032,
      "Jukcy;": 1028,
      "KHcy;": 1061,
      "KJcy;": 1036,
      "Kappa;": 922,
      "Kcedil;": 310,
      "Kcy;": 1050,
      "Kfr;": [55349, 56590],
      "Kopf;": [55349, 56642],
      "Kscr;": [55349, 56486],
      "LJcy;": 1033,
      "LT": 60,
      "LT;": 60,
      "Lacute;": 313,
      "Lambda;": 923,
      "Lang;": 10218,
      "Laplacetrf;": 8466,
      "Larr;": 8606,
      "Lcaron;": 317,
      "Lcedil;": 315,
      "Lcy;": 1051,
      "LeftAngleBracket;": 10216,
      "LeftArrow;": 8592,
      "LeftArrowBar;": 8676,
      "LeftArrowRightArrow;": 8646,
      "LeftCeiling;": 8968,
      "LeftDoubleBracket;": 10214,
      "LeftDownTeeVector;": 10593,
      "LeftDownVector;": 8643,
      "LeftDownVectorBar;": 10585,
      "LeftFloor;": 8970,
      "LeftRightArrow;": 8596,
      "LeftRightVector;": 10574,
      "LeftTee;": 8867,
      "LeftTeeArrow;": 8612,
      "LeftTeeVector;": 10586,
      "LeftTriangle;": 8882,
      "LeftTriangleBar;": 10703,
      "LeftTriangleEqual;": 8884,
      "LeftUpDownVector;": 10577,
      "LeftUpTeeVector;": 10592,
      "LeftUpVector;": 8639,
      "LeftUpVectorBar;": 10584,
      "LeftVector;": 8636,
      "LeftVectorBar;": 10578,
      "Leftarrow;": 8656,
      "Leftrightarrow;": 8660,
      "LessEqualGreater;": 8922,
      "LessFullEqual;": 8806,
      "LessGreater;": 8822,
      "LessLess;": 10913,
      "LessSlantEqual;": 10877,
      "LessTilde;": 8818,
      "Lfr;": [55349, 56591],
      "Ll;": 8920,
      "Lleftarrow;": 8666,
      "Lmidot;": 319,
      "LongLeftArrow;": 10229,
      "LongLeftRightArrow;": 10231,
      "LongRightArrow;": 10230,
      "Longleftarrow;": 10232,
      "Longleftrightarrow;": 10234,
      "Longrightarrow;": 10233,
      "Lopf;": [55349, 56643],
      "LowerLeftArrow;": 8601,
      "LowerRightArrow;": 8600,
      "Lscr;": 8466,
      "Lsh;": 8624,
      "Lstrok;": 321,
      "Lt;": 8810,
      "Map;": 10501,
      "Mcy;": 1052,
      "MediumSpace;": 8287,
      "Mellintrf;": 8499,
      "Mfr;": [55349, 56592],
      "MinusPlus;": 8723,
      "Mopf;": [55349, 56644],
      "Mscr;": 8499,
      "Mu;": 924,
      "NJcy;": 1034,
      "Nacute;": 323,
      "Ncaron;": 327,
      "Ncedil;": 325,
      "Ncy;": 1053,
      "NegativeMediumSpace;": 8203,
      "NegativeThickSpace;": 8203,
      "NegativeThinSpace;": 8203,
      "NegativeVeryThinSpace;": 8203,
      "NestedGreaterGreater;": 8811,
      "NestedLessLess;": 8810,
      "NewLine;": 10,
      "Nfr;": [55349, 56593],
      "NoBreak;": 8288,
      "NonBreakingSpace;": 160,
      "Nopf;": 8469,
      "Not;": 10988,
      "NotCongruent;": 8802,
      "NotCupCap;": 8813,
      "NotDoubleVerticalBar;": 8742,
      "NotElement;": 8713,
      "NotEqual;": 8800,
      "NotEqualTilde;": [8770, 824],
      "NotExists;": 8708,
      "NotGreater;": 8815,
      "NotGreaterEqual;": 8817,
      "NotGreaterFullEqual;": [8807, 824],
      "NotGreaterGreater;": [8811, 824],
      "NotGreaterLess;": 8825,
      "NotGreaterSlantEqual;": [10878, 824],
      "NotGreaterTilde;": 8821,
      "NotHumpDownHump;": [8782, 824],
      "NotHumpEqual;": [8783, 824],
      "NotLeftTriangle;": 8938,
      "NotLeftTriangleBar;": [10703, 824],
      "NotLeftTriangleEqual;": 8940,
      "NotLess;": 8814,
      "NotLessEqual;": 8816,
      "NotLessGreater;": 8824,
      "NotLessLess;": [8810, 824],
      "NotLessSlantEqual;": [10877, 824],
      "NotLessTilde;": 8820,
      "NotNestedGreaterGreater;": [10914, 824],
      "NotNestedLessLess;": [10913, 824],
      "NotPrecedes;": 8832,
      "NotPrecedesEqual;": [10927, 824],
      "NotPrecedesSlantEqual;": 8928,
      "NotReverseElement;": 8716,
      "NotRightTriangle;": 8939,
      "NotRightTriangleBar;": [10704, 824],
      "NotRightTriangleEqual;": 8941,
      "NotSquareSubset;": [8847, 824],
      "NotSquareSubsetEqual;": 8930,
      "NotSquareSuperset;": [8848, 824],
      "NotSquareSupersetEqual;": 8931,
      "NotSubset;": [8834, 8402],
      "NotSubsetEqual;": 8840,
      "NotSucceeds;": 8833,
      "NotSucceedsEqual;": [10928, 824],
      "NotSucceedsSlantEqual;": 8929,
      "NotSucceedsTilde;": [8831, 824],
      "NotSuperset;": [8835, 8402],
      "NotSupersetEqual;": 8841,
      "NotTilde;": 8769,
      "NotTildeEqual;": 8772,
      "NotTildeFullEqual;": 8775,
      "NotTildeTilde;": 8777,
      "NotVerticalBar;": 8740,
      "Nscr;": [55349, 56489],
      "Ntilde": 209,
      "Ntilde;": 209,
      "Nu;": 925,
      "OElig;": 338,
      "Oacute": 211,
      "Oacute;": 211,
      "Ocirc": 212,
      "Ocirc;": 212,
      "Ocy;": 1054,
      "Odblac;": 336,
      "Ofr;": [55349, 56594],
      "Ograve": 210,
      "Ograve;": 210,
      "Omacr;": 332,
      "Omega;": 937,
      "Omicron;": 927,
      "Oopf;": [55349, 56646],
      "OpenCurlyDoubleQuote;": 8220,
      "OpenCurlyQuote;": 8216,
      "Or;": 10836,
      "Oscr;": [55349, 56490],
      "Oslash": 216,
      "Oslash;": 216,
      "Otilde": 213,
      "Otilde;": 213,
      "Otimes;": 10807,
      "Ouml": 214,
      "Ouml;": 214,
      "OverBar;": 8254,
      "OverBrace;": 9182,
      "OverBracket;": 9140,
      "OverParenthesis;": 9180,
      "PartialD;": 8706,
      "Pcy;": 1055,
      "Pfr;": [55349, 56595],
      "Phi;": 934,
      "Pi;": 928,
      "PlusMinus;": 177,
      "Poincareplane;": 8460,
      "Popf;": 8473,
      "Pr;": 10939,
      "Precedes;": 8826,
      "PrecedesEqual;": 10927,
      "PrecedesSlantEqual;": 8828,
      "PrecedesTilde;": 8830,
      "Prime;": 8243,
      "Product;": 8719,
      "Proportion;": 8759,
      "Proportional;": 8733,
      "Pscr;": [55349, 56491],
      "Psi;": 936,
      "QUOT": 34,
      "QUOT;": 34,
      "Qfr;": [55349, 56596],
      "Qopf;": 8474,
      "Qscr;": [55349, 56492],
      "RBarr;": 10512,
      "REG": 174,
      "REG;": 174,
      "Racute;": 340,
      "Rang;": 10219,
      "Rarr;": 8608,
      "Rarrtl;": 10518,
      "Rcaron;": 344,
      "Rcedil;": 342,
      "Rcy;": 1056,
      "Re;": 8476,
      "ReverseElement;": 8715,
      "ReverseEquilibrium;": 8651,
      "ReverseUpEquilibrium;": 10607,
      "Rfr;": 8476,
      "Rho;": 929,
      "RightAngleBracket;": 10217,
      "RightArrow;": 8594,
      "RightArrowBar;": 8677,
      "RightArrowLeftArrow;": 8644,
      "RightCeiling;": 8969,
      "RightDoubleBracket;": 10215,
      "RightDownTeeVector;": 10589,
      "RightDownVector;": 8642,
      "RightDownVectorBar;": 10581,
      "RightFloor;": 8971,
      "RightTee;": 8866,
      "RightTeeArrow;": 8614,
      "RightTeeVector;": 10587,
      "RightTriangle;": 8883,
      "RightTriangleBar;": 10704,
      "RightTriangleEqual;": 8885,
      "RightUpDownVector;": 10575,
      "RightUpTeeVector;": 10588,
      "RightUpVector;": 8638,
      "RightUpVectorBar;": 10580,
      "RightVector;": 8640,
      "RightVectorBar;": 10579,
      "Rightarrow;": 8658,
      "Ropf;": 8477,
      "RoundImplies;": 10608,
      "Rrightarrow;": 8667,
      "Rscr;": 8475,
      "Rsh;": 8625,
      "RuleDelayed;": 10740,
      "SHCHcy;": 1065,
      "SHcy;": 1064,
      "SOFTcy;": 1068,
      "Sacute;": 346,
      "Sc;": 10940,
      "Scaron;": 352,
      "Scedil;": 350,
      "Scirc;": 348,
      "Scy;": 1057,
      "Sfr;": [55349, 56598],
      "ShortDownArrow;": 8595,
      "ShortLeftArrow;": 8592,
      "ShortRightArrow;": 8594,
      "ShortUpArrow;": 8593,
      "Sigma;": 931,
      "SmallCircle;": 8728,
      "Sopf;": [55349, 56650],
      "Sqrt;": 8730,
      "Square;": 9633,
      "SquareIntersection;": 8851,
      "SquareSubset;": 8847,
      "SquareSubsetEqual;": 8849,
      "SquareSuperset;": 8848,
      "SquareSupersetEqual;": 8850,
      "SquareUnion;": 8852,
      "Sscr;": [55349, 56494],
      "Star;": 8902,
      "Sub;": 8912,
      "Subset;": 8912,
      "SubsetEqual;": 8838,
      "Succeeds;": 8827,
      "SucceedsEqual;": 10928,
      "SucceedsSlantEqual;": 8829,
      "SucceedsTilde;": 8831,
      "SuchThat;": 8715,
      "Sum;": 8721,
      "Sup;": 8913,
      "Superset;": 8835,
      "SupersetEqual;": 8839,
      "Supset;": 8913,
      "THORN": 222,
      "THORN;": 222,
      "TRADE;": 8482,
      "TSHcy;": 1035,
      "TScy;": 1062,
      "Tab;": 9,
      "Tau;": 932,
      "Tcaron;": 356,
      "Tcedil;": 354,
      "Tcy;": 1058,
      "Tfr;": [55349, 56599],
      "Therefore;": 8756,
      "Theta;": 920,
      "ThickSpace;": [8287, 8202],
      "ThinSpace;": 8201,
      "Tilde;": 8764,
      "TildeEqual;": 8771,
      "TildeFullEqual;": 8773,
      "TildeTilde;": 8776,
      "Topf;": [55349, 56651],
      "TripleDot;": 8411,
      "Tscr;": [55349, 56495],
      "Tstrok;": 358,
      "Uacute": 218,
      "Uacute;": 218,
      "Uarr;": 8607,
      "Uarrocir;": 10569,
      "Ubrcy;": 1038,
      "Ubreve;": 364,
      "Ucirc": 219,
      "Ucirc;": 219,
      "Ucy;": 1059,
      "Udblac;": 368,
      "Ufr;": [55349, 56600],
      "Ugrave": 217,
      "Ugrave;": 217,
      "Umacr;": 362,
      "UnderBar;": 95,
      "UnderBrace;": 9183,
      "UnderBracket;": 9141,
      "UnderParenthesis;": 9181,
      "Union;": 8899,
      "UnionPlus;": 8846,
      "Uogon;": 370,
      "Uopf;": [55349, 56652],
      "UpArrow;": 8593,
      "UpArrowBar;": 10514,
      "UpArrowDownArrow;": 8645,
      "UpDownArrow;": 8597,
      "UpEquilibrium;": 10606,
      "UpTee;": 8869,
      "UpTeeArrow;": 8613,
      "Uparrow;": 8657,
      "Updownarrow;": 8661,
      "UpperLeftArrow;": 8598,
      "UpperRightArrow;": 8599,
      "Upsi;": 978,
      "Upsilon;": 933,
      "Uring;": 366,
      "Uscr;": [55349, 56496],
      "Utilde;": 360,
      "Uuml": 220,
      "Uuml;": 220,
      "VDash;": 8875,
      "Vbar;": 10987,
      "Vcy;": 1042,
      "Vdash;": 8873,
      "Vdashl;": 10982,
      "Vee;": 8897,
      "Verbar;": 8214,
      "Vert;": 8214,
      "VerticalBar;": 8739,
      "VerticalLine;": 124,
      "VerticalSeparator;": 10072,
      "VerticalTilde;": 8768,
      "VeryThinSpace;": 8202,
      "Vfr;": [55349, 56601],
      "Vopf;": [55349, 56653],
      "Vscr;": [55349, 56497],
      "Vvdash;": 8874,
      "Wcirc;": 372,
      "Wedge;": 8896,
      "Wfr;": [55349, 56602],
      "Wopf;": [55349, 56654],
      "Wscr;": [55349, 56498],
      "Xfr;": [55349, 56603],
      "Xi;": 926,
      "Xopf;": [55349, 56655],
      "Xscr;": [55349, 56499],
      "YAcy;": 1071,
      "YIcy;": 1031,
      "YUcy;": 1070,
      "Yacute": 221,
      "Yacute;": 221,
      "Ycirc;": 374,
      "Ycy;": 1067,
      "Yfr;": [55349, 56604],
      "Yopf;": [55349, 56656],
      "Yscr;": [55349, 56500],
      "Yuml;": 376,
      "ZHcy;": 1046,
      "Zacute;": 377,
      "Zcaron;": 381,
      "Zcy;": 1047,
      "Zdot;": 379,
      "ZeroWidthSpace;": 8203,
      "Zeta;": 918,
      "Zfr;": 8488,
      "Zopf;": 8484,
      "Zscr;": [55349, 56501],
      "aacute": 225,
      "aacute;": 225,
      "abreve;": 259,
      "ac;": 8766,
      "acE;": [8766, 819],
      "acd;": 8767,
      "acirc": 226,
      "acirc;": 226,
      "acute": 180,
      "acute;": 180,
      "acy;": 1072,
      "aelig": 230,
      "aelig;": 230,
      "af;": 8289,
      "afr;": [55349, 56606],
      "agrave": 224,
      "agrave;": 224,
      "alefsym;": 8501,
      "aleph;": 8501,
      "alpha;": 945,
      "amacr;": 257,
      "amalg;": 10815,
      "amp": 38,
      "amp;": 38,
      "and;": 8743,
      "andand;": 10837,
      "andd;": 10844,
      "andslope;": 10840,
      "andv;": 10842,
      "ang;": 8736,
      "ange;": 10660,
      "angle;": 8736,
      "angmsd;": 8737,
      "angmsdaa;": 10664,
      "angmsdab;": 10665,
      "angmsdac;": 10666,
      "angmsdad;": 10667,
      "angmsdae;": 10668,
      "angmsdaf;": 10669,
      "angmsdag;": 10670,
      "angmsdah;": 10671,
      "angrt;": 8735,
      "angrtvb;": 8894,
      "angrtvbd;": 10653,
      "angsph;": 8738,
      "angst;": 197,
      "angzarr;": 9084,
      "aogon;": 261,
      "aopf;": [55349, 56658],
      "ap;": 8776,
      "apE;": 10864,
      "apacir;": 10863,
      "ape;": 8778,
      "apid;": 8779,
      "apos;": 39,
      "approx;": 8776,
      "approxeq;": 8778,
      "aring": 229,
      "aring;": 229,
      "ascr;": [55349, 56502],
      "ast;": 42,
      "asymp;": 8776,
      "asympeq;": 8781,
      "atilde": 227,
      "atilde;": 227,
      "auml": 228,
      "auml;": 228,
      "awconint;": 8755,
      "awint;": 10769,
      "bNot;": 10989,
      "backcong;": 8780,
      "backepsilon;": 1014,
      "backprime;": 8245,
      "backsim;": 8765,
      "backsimeq;": 8909,
      "barvee;": 8893,
      "barwed;": 8965,
      "barwedge;": 8965,
      "bbrk;": 9141,
      "bbrktbrk;": 9142,
      "bcong;": 8780,
      "bcy;": 1073,
      "bdquo;": 8222,
      "becaus;": 8757,
      "because;": 8757,
      "bemptyv;": 10672,
      "bepsi;": 1014,
      "bernou;": 8492,
      "beta;": 946,
      "beth;": 8502,
      "between;": 8812,
      "bfr;": [55349, 56607],
      "bigcap;": 8898,
      "bigcirc;": 9711,
      "bigcup;": 8899,
      "bigodot;": 10752,
      "bigoplus;": 10753,
      "bigotimes;": 10754,
      "bigsqcup;": 10758,
      "bigstar;": 9733,
      "bigtriangledown;": 9661,
      "bigtriangleup;": 9651,
      "biguplus;": 10756,
      "bigvee;": 8897,
      "bigwedge;": 8896,
      "bkarow;": 10509,
      "blacklozenge;": 10731,
      "blacksquare;": 9642,
      "blacktriangle;": 9652,
      "blacktriangledown;": 9662,
      "blacktriangleleft;": 9666,
      "blacktriangleright;": 9656,
      "blank;": 9251,
      "blk12;": 9618,
      "blk14;": 9617,
      "blk34;": 9619,
      "block;": 9608,
      "bne;": [61, 8421],
      "bnequiv;": [8801, 8421],
      "bnot;": 8976,
      "bopf;": [55349, 56659],
      "bot;": 8869,
      "bottom;": 8869,
      "bowtie;": 8904,
      "boxDL;": 9559,
      "boxDR;": 9556,
      "boxDl;": 9558,
      "boxDr;": 9555,
      "boxH;": 9552,
      "boxHD;": 9574,
      "boxHU;": 9577,
      "boxHd;": 9572,
      "boxHu;": 9575,
      "boxUL;": 9565,
      "boxUR;": 9562,
      "boxUl;": 9564,
      "boxUr;": 9561,
      "boxV;": 9553,
      "boxVH;": 9580,
      "boxVL;": 9571,
      "boxVR;": 9568,
      "boxVh;": 9579,
      "boxVl;": 9570,
      "boxVr;": 9567,
      "boxbox;": 10697,
      "boxdL;": 9557,
      "boxdR;": 9554,
      "boxdl;": 9488,
      "boxdr;": 9484,
      "boxh;": 9472,
      "boxhD;": 9573,
      "boxhU;": 9576,
      "boxhd;": 9516,
      "boxhu;": 9524,
      "boxminus;": 8863,
      "boxplus;": 8862,
      "boxtimes;": 8864,
      "boxuL;": 9563,
      "boxuR;": 9560,
      "boxul;": 9496,
      "boxur;": 9492,
      "boxv;": 9474,
      "boxvH;": 9578,
      "boxvL;": 9569,
      "boxvR;": 9566,
      "boxvh;": 9532,
      "boxvl;": 9508,
      "boxvr;": 9500,
      "bprime;": 8245,
      "breve;": 728,
      "brvbar": 166,
      "brvbar;": 166,
      "bscr;": [55349, 56503],
      "bsemi;": 8271,
      "bsim;": 8765,
      "bsime;": 8909,
      "bsol;": 92,
      "bsolb;": 10693,
      "bsolhsub;": 10184,
      "bull;": 8226,
      "bullet;": 8226,
      "bump;": 8782,
      "bumpE;": 10926,
      "bumpe;": 8783,
      "bumpeq;": 8783,
      "cacute;": 263,
      "cap;": 8745,
      "capand;": 10820,
      "capbrcup;": 10825,
      "capcap;": 10827,
      "capcup;": 10823,
      "capdot;": 10816,
      "caps;": [8745, 65024],
      "caret;": 8257,
      "caron;": 711,
      "ccaps;": 10829,
      "ccaron;": 269,
      "ccedil": 231,
      "ccedil;": 231,
      "ccirc;": 265,
      "ccups;": 10828,
      "ccupssm;": 10832,
      "cdot;": 267,
      "cedil": 184,
      "cedil;": 184,
      "cemptyv;": 10674,
      "cent": 162,
      "cent;": 162,
      "centerdot;": 183,
      "cfr;": [55349, 56608],
      "chcy;": 1095,
      "check;": 10003,
      "checkmark;": 10003,
      "chi;": 967,
      "cir;": 9675,
      "cirE;": 10691,
      "circ;": 710,
      "circeq;": 8791,
      "circlearrowleft;": 8634,
      "circlearrowright;": 8635,
      "circledR;": 174,
      "circledS;": 9416,
      "circledast;": 8859,
      "circledcirc;": 8858,
      "circleddash;": 8861,
      "cire;": 8791,
      "cirfnint;": 10768,
      "cirmid;": 10991,
      "cirscir;": 10690,
      "clubs;": 9827,
      "clubsuit;": 9827,
      "colon;": 58,
      "colone;": 8788,
      "coloneq;": 8788,
      "comma;": 44,
      "commat;": 64,
      "comp;": 8705,
      "compfn;": 8728,
      "complement;": 8705,
      "complexes;": 8450,
      "cong;": 8773,
      "congdot;": 10861,
      "conint;": 8750,
      "copf;": [55349, 56660],
      "coprod;": 8720,
      "copy": 169,
      "copy;": 169,
      "copysr;": 8471,
      "crarr;": 8629,
      "cross;": 10007,
      "cscr;": [55349, 56504],
      "csub;": 10959,
      "csube;": 10961,
      "csup;": 10960,
      "csupe;": 10962,
      "ctdot;": 8943,
      "cudarrl;": 10552,
      "cudarrr;": 10549,
      "cuepr;": 8926,
      "cuesc;": 8927,
      "cularr;": 8630,
      "cularrp;": 10557,
      "cup;": 8746,
      "cupbrcap;": 10824,
      "cupcap;": 10822,
      "cupcup;": 10826,
      "cupdot;": 8845,
      "cupor;": 10821,
      "cups;": [8746, 65024],
      "curarr;": 8631,
      "curarrm;": 10556,
      "curlyeqprec;": 8926,
      "curlyeqsucc;": 8927,
      "curlyvee;": 8910,
      "curlywedge;": 8911,
      "curren": 164,
      "curren;": 164,
      "curvearrowleft;": 8630,
      "curvearrowright;": 8631,
      "cuvee;": 8910,
      "cuwed;": 8911,
      "cwconint;": 8754,
      "cwint;": 8753,
      "cylcty;": 9005,
      "dArr;": 8659,
      "dHar;": 10597,
      "dagger;": 8224,
      "daleth;": 8504,
      "darr;": 8595,
      "dash;": 8208,
      "dashv;": 8867,
      "dbkarow;": 10511,
      "dblac;": 733,
      "dcaron;": 271,
      "dcy;": 1076,
      "dd;": 8518,
      "ddagger;": 8225,
      "ddarr;": 8650,
      "ddotseq;": 10871,
      "deg": 176,
      "deg;": 176,
      "delta;": 948,
      "demptyv;": 10673,
      "dfisht;": 10623,
      "dfr;": [55349, 56609],
      "dharl;": 8643,
      "dharr;": 8642,
      "diam;": 8900,
      "diamond;": 8900,
      "diamondsuit;": 9830,
      "diams;": 9830,
      "die;": 168,
      "digamma;": 989,
      "disin;": 8946,
      "div;": 247,
      "divide": 247,
      "divide;": 247,
      "divideontimes;": 8903,
      "divonx;": 8903,
      "djcy;": 1106,
      "dlcorn;": 8990,
      "dlcrop;": 8973,
      "dollar;": 36,
      "dopf;": [55349, 56661],
      "dot;": 729,
      "doteq;": 8784,
      "doteqdot;": 8785,
      "dotminus;": 8760,
      "dotplus;": 8724,
      "dotsquare;": 8865,
      "doublebarwedge;": 8966,
      "downarrow;": 8595,
      "downdownarrows;": 8650,
      "downharpoonleft;": 8643,
      "downharpoonright;": 8642,
      "drbkarow;": 10512,
      "drcorn;": 8991,
      "drcrop;": 8972,
      "dscr;": [55349, 56505],
      "dscy;": 1109,
      "dsol;": 10742,
      "dstrok;": 273,
      "dtdot;": 8945,
      "dtri;": 9663,
      "dtrif;": 9662,
      "duarr;": 8693,
      "duhar;": 10607,
      "dwangle;": 10662,
      "dzcy;": 1119,
      "dzigrarr;": 10239,
      "eDDot;": 10871,
      "eDot;": 8785,
      "eacute": 233,
      "eacute;": 233,
      "easter;": 10862,
      "ecaron;": 283,
      "ecir;": 8790,
      "ecirc": 234,
      "ecirc;": 234,
      "ecolon;": 8789,
      "ecy;": 1101,
      "edot;": 279,
      "ee;": 8519,
      "efDot;": 8786,
      "efr;": [55349, 56610],
      "eg;": 10906,
      "egrave": 232,
      "egrave;": 232,
      "egs;": 10902,
      "egsdot;": 10904,
      "el;": 10905,
      "elinters;": 9191,
      "ell;": 8467,
      "els;": 10901,
      "elsdot;": 10903,
      "emacr;": 275,
      "empty;": 8709,
      "emptyset;": 8709,
      "emptyv;": 8709,
      "emsp13;": 8196,
      "emsp14;": 8197,
      "emsp;": 8195,
      "eng;": 331,
      "ensp;": 8194,
      "eogon;": 281,
      "eopf;": [55349, 56662],
      "epar;": 8917,
      "eparsl;": 10723,
      "eplus;": 10865,
      "epsi;": 949,
      "epsilon;": 949,
      "epsiv;": 1013,
      "eqcirc;": 8790,
      "eqcolon;": 8789,
      "eqsim;": 8770,
      "eqslantgtr;": 10902,
      "eqslantless;": 10901,
      "equals;": 61,
      "equest;": 8799,
      "equiv;": 8801,
      "equivDD;": 10872,
      "eqvparsl;": 10725,
      "erDot;": 8787,
      "erarr;": 10609,
      "escr;": 8495,
      "esdot;": 8784,
      "esim;": 8770,
      "eta;": 951,
      "eth": 240,
      "eth;": 240,
      "euml": 235,
      "euml;": 235,
      "euro;": 8364,
      "excl;": 33,
      "exist;": 8707,
      "expectation;": 8496,
      "exponentiale;": 8519,
      "fallingdotseq;": 8786,
      "fcy;": 1092,
      "female;": 9792,
      "ffilig;": 64259,
      "fflig;": 64256,
      "ffllig;": 64260,
      "ffr;": [55349, 56611],
      "filig;": 64257,
      "fjlig;": [102, 106],
      "flat;": 9837,
      "fllig;": 64258,
      "fltns;": 9649,
      "fnof;": 402,
      "fopf;": [55349, 56663],
      "forall;": 8704,
      "fork;": 8916,
      "forkv;": 10969,
      "fpartint;": 10765,
      "frac12": 189,
      "frac12;": 189,
      "frac13;": 8531,
      "frac14": 188,
      "frac14;": 188,
      "frac15;": 8533,
      "frac16;": 8537,
      "frac18;": 8539,
      "frac23;": 8532,
      "frac25;": 8534,
      "frac34": 190,
      "frac34;": 190,
      "frac35;": 8535,
      "frac38;": 8540,
      "frac45;": 8536,
      "frac56;": 8538,
      "frac58;": 8541,
      "frac78;": 8542,
      "frasl;": 8260,
      "frown;": 8994,
      "fscr;": [55349, 56507],
      "gE;": 8807,
      "gEl;": 10892,
      "gacute;": 501,
      "gamma;": 947,
      "gammad;": 989,
      "gap;": 10886,
      "gbreve;": 287,
      "gcirc;": 285,
      "gcy;": 1075,
      "gdot;": 289,
      "ge;": 8805,
      "gel;": 8923,
      "geq;": 8805,
      "geqq;": 8807,
      "geqslant;": 10878,
      "ges;": 10878,
      "gescc;": 10921,
      "gesdot;": 10880,
      "gesdoto;": 10882,
      "gesdotol;": 10884,
      "gesl;": [8923, 65024],
      "gesles;": 10900,
      "gfr;": [55349, 56612],
      "gg;": 8811,
      "ggg;": 8921,
      "gimel;": 8503,
      "gjcy;": 1107,
      "gl;": 8823,
      "glE;": 10898,
      "gla;": 10917,
      "glj;": 10916,
      "gnE;": 8809,
      "gnap;": 10890,
      "gnapprox;": 10890,
      "gne;": 10888,
      "gneq;": 10888,
      "gneqq;": 8809,
      "gnsim;": 8935,
      "gopf;": [55349, 56664],
      "grave;": 96,
      "gscr;": 8458,
      "gsim;": 8819,
      "gsime;": 10894,
      "gsiml;": 10896,
      "gt": 62,
      "gt;": 62,
      "gtcc;": 10919,
      "gtcir;": 10874,
      "gtdot;": 8919,
      "gtlPar;": 10645,
      "gtquest;": 10876,
      "gtrapprox;": 10886,
      "gtrarr;": 10616,
      "gtrdot;": 8919,
      "gtreqless;": 8923,
      "gtreqqless;": 10892,
      "gtrless;": 8823,
      "gtrsim;": 8819,
      "gvertneqq;": [8809, 65024],
      "gvnE;": [8809, 65024],
      "hArr;": 8660,
      "hairsp;": 8202,
      "half;": 189,
      "hamilt;": 8459,
      "hardcy;": 1098,
      "harr;": 8596,
      "harrcir;": 10568,
      "harrw;": 8621,
      "hbar;": 8463,
      "hcirc;": 293,
      "hearts;": 9829,
      "heartsuit;": 9829,
      "hellip;": 8230,
      "hercon;": 8889,
      "hfr;": [55349, 56613],
      "hksearow;": 10533,
      "hkswarow;": 10534,
      "hoarr;": 8703,
      "homtht;": 8763,
      "hookleftarrow;": 8617,
      "hookrightarrow;": 8618,
      "hopf;": [55349, 56665],
      "horbar;": 8213,
      "hscr;": [55349, 56509],
      "hslash;": 8463,
      "hstrok;": 295,
      "hybull;": 8259,
      "hyphen;": 8208,
      "iacute": 237,
      "iacute;": 237,
      "ic;": 8291,
      "icirc": 238,
      "icirc;": 238,
      "icy;": 1080,
      "iecy;": 1077,
      "iexcl": 161,
      "iexcl;": 161,
      "iff;": 8660,
      "ifr;": [55349, 56614],
      "igrave": 236,
      "igrave;": 236,
      "ii;": 8520,
      "iiiint;": 10764,
      "iiint;": 8749,
      "iinfin;": 10716,
      "iiota;": 8489,
      "ijlig;": 307,
      "imacr;": 299,
      "image;": 8465,
      "imagline;": 8464,
      "imagpart;": 8465,
      "imath;": 305,
      "imof;": 8887,
      "imped;": 437,
      "in;": 8712,
      "incare;": 8453,
      "infin;": 8734,
      "infintie;": 10717,
      "inodot;": 305,
      "int;": 8747,
      "intcal;": 8890,
      "integers;": 8484,
      "intercal;": 8890,
      "intlarhk;": 10775,
      "intprod;": 10812,
      "iocy;": 1105,
      "iogon;": 303,
      "iopf;": [55349, 56666],
      "iota;": 953,
      "iprod;": 10812,
      "iquest": 191,
      "iquest;": 191,
      "iscr;": [55349, 56510],
      "isin;": 8712,
      "isinE;": 8953,
      "isindot;": 8949,
      "isins;": 8948,
      "isinsv;": 8947,
      "isinv;": 8712,
      "it;": 8290,
      "itilde;": 297,
      "iukcy;": 1110,
      "iuml": 239,
      "iuml;": 239,
      "jcirc;": 309,
      "jcy;": 1081,
      "jfr;": [55349, 56615],
      "jmath;": 567,
      "jopf;": [55349, 56667],
      "jscr;": [55349, 56511],
      "jsercy;": 1112,
      "jukcy;": 1108,
      "kappa;": 954,
      "kappav;": 1008,
      "kcedil;": 311,
      "kcy;": 1082,
      "kfr;": [55349, 56616],
      "kgreen;": 312,
      "khcy;": 1093,
      "kjcy;": 1116,
      "kopf;": [55349, 56668],
      "kscr;": [55349, 56512],
      "lAarr;": 8666,
      "lArr;": 8656,
      "lAtail;": 10523,
      "lBarr;": 10510,
      "lE;": 8806,
      "lEg;": 10891,
      "lHar;": 10594,
      "lacute;": 314,
      "laemptyv;": 10676,
      "lagran;": 8466,
      "lambda;": 955,
      "lang;": 10216,
      "langd;": 10641,
      "langle;": 10216,
      "lap;": 10885,
      "laquo": 171,
      "laquo;": 171,
      "larr;": 8592,
      "larrb;": 8676,
      "larrbfs;": 10527,
      "larrfs;": 10525,
      "larrhk;": 8617,
      "larrlp;": 8619,
      "larrpl;": 10553,
      "larrsim;": 10611,
      "larrtl;": 8610,
      "lat;": 10923,
      "latail;": 10521,
      "late;": 10925,
      "lates;": [10925, 65024],
      "lbarr;": 10508,
      "lbbrk;": 10098,
      "lbrace;": 123,
      "lbrack;": 91,
      "lbrke;": 10635,
      "lbrksld;": 10639,
      "lbrkslu;": 10637,
      "lcaron;": 318,
      "lcedil;": 316,
      "lceil;": 8968,
      "lcub;": 123,
      "lcy;": 1083,
      "ldca;": 10550,
      "ldquo;": 8220,
      "ldquor;": 8222,
      "ldrdhar;": 10599,
      "ldrushar;": 10571,
      "ldsh;": 8626,
      "le;": 8804,
      "leftarrow;": 8592,
      "leftarrowtail;": 8610,
      "leftharpoondown;": 8637,
      "leftharpoonup;": 8636,
      "leftleftarrows;": 8647,
      "leftrightarrow;": 8596,
      "leftrightarrows;": 8646,
      "leftrightharpoons;": 8651,
      "leftrightsquigarrow;": 8621,
      "leftthreetimes;": 8907,
      "leg;": 8922,
      "leq;": 8804,
      "leqq;": 8806,
      "leqslant;": 10877,
      "les;": 10877,
      "lescc;": 10920,
      "lesdot;": 10879,
      "lesdoto;": 10881,
      "lesdotor;": 10883,
      "lesg;": [8922, 65024],
      "lesges;": 10899,
      "lessapprox;": 10885,
      "lessdot;": 8918,
      "lesseqgtr;": 8922,
      "lesseqqgtr;": 10891,
      "lessgtr;": 8822,
      "lesssim;": 8818,
      "lfisht;": 10620,
      "lfloor;": 8970,
      "lfr;": [55349, 56617],
      "lg;": 8822,
      "lgE;": 10897,
      "lhard;": 8637,
      "lharu;": 8636,
      "lharul;": 10602,
      "lhblk;": 9604,
      "ljcy;": 1113,
      "ll;": 8810,
      "llarr;": 8647,
      "llcorner;": 8990,
      "llhard;": 10603,
      "lltri;": 9722,
      "lmidot;": 320,
      "lmoust;": 9136,
      "lmoustache;": 9136,
      "lnE;": 8808,
      "lnap;": 10889,
      "lnapprox;": 10889,
      "lne;": 10887,
      "lneq;": 10887,
      "lneqq;": 8808,
      "lnsim;": 8934,
      "loang;": 10220,
      "loarr;": 8701,
      "lobrk;": 10214,
      "longleftarrow;": 10229,
      "longleftrightarrow;": 10231,
      "longmapsto;": 10236,
      "longrightarrow;": 10230,
      "looparrowleft;": 8619,
      "looparrowright;": 8620,
      "lopar;": 10629,
      "lopf;": [55349, 56669],
      "loplus;": 10797,
      "lotimes;": 10804,
      "lowast;": 8727,
      "lowbar;": 95,
      "loz;": 9674,
      "lozenge;": 9674,
      "lozf;": 10731,
      "lpar;": 40,
      "lparlt;": 10643,
      "lrarr;": 8646,
      "lrcorner;": 8991,
      "lrhar;": 8651,
      "lrhard;": 10605,
      "lrm;": 8206,
      "lrtri;": 8895,
      "lsaquo;": 8249,
      "lscr;": [55349, 56513],
      "lsh;": 8624,
      "lsim;": 8818,
      "lsime;": 10893,
      "lsimg;": 10895,
      "lsqb;": 91,
      "lsquo;": 8216,
      "lsquor;": 8218,
      "lstrok;": 322,
      "lt": 60,
      "lt;": 60,
      "ltcc;": 10918,
      "ltcir;": 10873,
      "ltdot;": 8918,
      "lthree;": 8907,
      "ltimes;": 8905,
      "ltlarr;": 10614,
      "ltquest;": 10875,
      "ltrPar;": 10646,
      "ltri;": 9667,
      "ltrie;": 8884,
      "ltrif;": 9666,
      "lurdshar;": 10570,
      "luruhar;": 10598,
      "lvertneqq;": [8808, 65024],
      "lvnE;": [8808, 65024],
      "mDDot;": 8762,
      "macr": 175,
      "macr;": 175,
      "male;": 9794,
      "malt;": 10016,
      "maltese;": 10016,
      "map;": 8614,
      "mapsto;": 8614,
      "mapstodown;": 8615,
      "mapstoleft;": 8612,
      "mapstoup;": 8613,
      "marker;": 9646,
      "mcomma;": 10793,
      "mcy;": 1084,
      "mdash;": 8212,
      "measuredangle;": 8737,
      "mfr;": [55349, 56618],
      "mho;": 8487,
      "micro": 181,
      "micro;": 181,
      "mid;": 8739,
      "midast;": 42,
      "midcir;": 10992,
      "middot": 183,
      "middot;": 183,
      "minus;": 8722,
      "minusb;": 8863,
      "minusd;": 8760,
      "minusdu;": 10794,
      "mlcp;": 10971,
      "mldr;": 8230,
      "mnplus;": 8723,
      "models;": 8871,
      "mopf;": [55349, 56670],
      "mp;": 8723,
      "mscr;": [55349, 56514],
      "mstpos;": 8766,
      "mu;": 956,
      "multimap;": 8888,
      "mumap;": 8888,
      "nGg;": [8921, 824],
      "nGt;": [8811, 8402],
      "nGtv;": [8811, 824],
      "nLeftarrow;": 8653,
      "nLeftrightarrow;": 8654,
      "nLl;": [8920, 824],
      "nLt;": [8810, 8402],
      "nLtv;": [8810, 824],
      "nRightarrow;": 8655,
      "nVDash;": 8879,
      "nVdash;": 8878,
      "nabla;": 8711,
      "nacute;": 324,
      "nang;": [8736, 8402],
      "nap;": 8777,
      "napE;": [10864, 824],
      "napid;": [8779, 824],
      "napos;": 329,
      "napprox;": 8777,
      "natur;": 9838,
      "natural;": 9838,
      "naturals;": 8469,
      "nbsp": 160,
      "nbsp;": 160,
      "nbump;": [8782, 824],
      "nbumpe;": [8783, 824],
      "ncap;": 10819,
      "ncaron;": 328,
      "ncedil;": 326,
      "ncong;": 8775,
      "ncongdot;": [10861, 824],
      "ncup;": 10818,
      "ncy;": 1085,
      "ndash;": 8211,
      "ne;": 8800,
      "neArr;": 8663,
      "nearhk;": 10532,
      "nearr;": 8599,
      "nearrow;": 8599,
      "nedot;": [8784, 824],
      "nequiv;": 8802,
      "nesear;": 10536,
      "nesim;": [8770, 824],
      "nexist;": 8708,
      "nexists;": 8708,
      "nfr;": [55349, 56619],
      "ngE;": [8807, 824],
      "nge;": 8817,
      "ngeq;": 8817,
      "ngeqq;": [8807, 824],
      "ngeqslant;": [10878, 824],
      "nges;": [10878, 824],
      "ngsim;": 8821,
      "ngt;": 8815,
      "ngtr;": 8815,
      "nhArr;": 8654,
      "nharr;": 8622,
      "nhpar;": 10994,
      "ni;": 8715,
      "nis;": 8956,
      "nisd;": 8954,
      "niv;": 8715,
      "njcy;": 1114,
      "nlArr;": 8653,
      "nlE;": [8806, 824],
      "nlarr;": 8602,
      "nldr;": 8229,
      "nle;": 8816,
      "nleftarrow;": 8602,
      "nleftrightarrow;": 8622,
      "nleq;": 8816,
      "nleqq;": [8806, 824],
      "nleqslant;": [10877, 824],
      "nles;": [10877, 824],
      "nless;": 8814,
      "nlsim;": 8820,
      "nlt;": 8814,
      "nltri;": 8938,
      "nltrie;": 8940,
      "nmid;": 8740,
      "nopf;": [55349, 56671],
      "not": 172,
      "not;": 172,
      "notin;": 8713,
      "notinE;": [8953, 824],
      "notindot;": [8949, 824],
      "notinva;": 8713,
      "notinvb;": 8951,
      "notinvc;": 8950,
      "notni;": 8716,
      "notniva;": 8716,
      "notnivb;": 8958,
      "notnivc;": 8957,
      "npar;": 8742,
      "nparallel;": 8742,
      "nparsl;": [11005, 8421],
      "npart;": [8706, 824],
      "npolint;": 10772,
      "npr;": 8832,
      "nprcue;": 8928,
      "npre;": [10927, 824],
      "nprec;": 8832,
      "npreceq;": [10927, 824],
      "nrArr;": 8655,
      "nrarr;": 8603,
      "nrarrc;": [10547, 824],
      "nrarrw;": [8605, 824],
      "nrightarrow;": 8603,
      "nrtri;": 8939,
      "nrtrie;": 8941,
      "nsc;": 8833,
      "nsccue;": 8929,
      "nsce;": [10928, 824],
      "nscr;": [55349, 56515],
      "nshortmid;": 8740,
      "nshortparallel;": 8742,
      "nsim;": 8769,
      "nsime;": 8772,
      "nsimeq;": 8772,
      "nsmid;": 8740,
      "nspar;": 8742,
      "nsqsube;": 8930,
      "nsqsupe;": 8931,
      "nsub;": 8836,
      "nsubE;": [10949, 824],
      "nsube;": 8840,
      "nsubset;": [8834, 8402],
      "nsubseteq;": 8840,
      "nsubseteqq;": [10949, 824],
      "nsucc;": 8833,
      "nsucceq;": [10928, 824],
      "nsup;": 8837,
      "nsupE;": [10950, 824],
      "nsupe;": 8841,
      "nsupset;": [8835, 8402],
      "nsupseteq;": 8841,
      "nsupseteqq;": [10950, 824],
      "ntgl;": 8825,
      "ntilde": 241,
      "ntilde;": 241,
      "ntlg;": 8824,
      "ntriangleleft;": 8938,
      "ntrianglelefteq;": 8940,
      "ntriangleright;": 8939,
      "ntrianglerighteq;": 8941,
      "nu;": 957,
      "num;": 35,
      "numero;": 8470,
      "numsp;": 8199,
      "nvDash;": 8877,
      "nvHarr;": 10500,
      "nvap;": [8781, 8402],
      "nvdash;": 8876,
      "nvge;": [8805, 8402],
      "nvgt;": [62, 8402],
      "nvinfin;": 10718,
      "nvlArr;": 10498,
      "nvle;": [8804, 8402],
      "nvlt;": [60, 8402],
      "nvltrie;": [8884, 8402],
      "nvrArr;": 10499,
      "nvrtrie;": [8885, 8402],
      "nvsim;": [8764, 8402],
      "nwArr;": 8662,
      "nwarhk;": 10531,
      "nwarr;": 8598,
      "nwarrow;": 8598,
      "nwnear;": 10535,
      "oS;": 9416,
      "oacute": 243,
      "oacute;": 243,
      "oast;": 8859,
      "ocir;": 8858,
      "ocirc": 244,
      "ocirc;": 244,
      "ocy;": 1086,
      "odash;": 8861,
      "odblac;": 337,
      "odiv;": 10808,
      "odot;": 8857,
      "odsold;": 10684,
      "oelig;": 339,
      "ofcir;": 10687,
      "ofr;": [55349, 56620],
      "ogon;": 731,
      "ograve": 242,
      "ograve;": 242,
      "ogt;": 10689,
      "ohbar;": 10677,
      "ohm;": 937,
      "oint;": 8750,
      "olarr;": 8634,
      "olcir;": 10686,
      "olcross;": 10683,
      "oline;": 8254,
      "olt;": 10688,
      "omacr;": 333,
      "omega;": 969,
      "omicron;": 959,
      "omid;": 10678,
      "ominus;": 8854,
      "oopf;": [55349, 56672],
      "opar;": 10679,
      "operp;": 10681,
      "oplus;": 8853,
      "or;": 8744,
      "orarr;": 8635,
      "ord;": 10845,
      "order;": 8500,
      "orderof;": 8500,
      "ordf": 170,
      "ordf;": 170,
      "ordm": 186,
      "ordm;": 186,
      "origof;": 8886,
      "oror;": 10838,
      "orslope;": 10839,
      "orv;": 10843,
      "oscr;": 8500,
      "oslash": 248,
      "oslash;": 248,
      "osol;": 8856,
      "otilde": 245,
      "otilde;": 245,
      "otimes;": 8855,
      "otimesas;": 10806,
      "ouml": 246,
      "ouml;": 246,
      "ovbar;": 9021,
      "par;": 8741,
      "para": 182,
      "para;": 182,
      "parallel;": 8741,
      "parsim;": 10995,
      "parsl;": 11005,
      "part;": 8706,
      "pcy;": 1087,
      "percnt;": 37,
      "period;": 46,
      "permil;": 8240,
      "perp;": 8869,
      "pertenk;": 8241,
      "pfr;": [55349, 56621],
      "phi;": 966,
      "phiv;": 981,
      "phmmat;": 8499,
      "phone;": 9742,
      "pi;": 960,
      "pitchfork;": 8916,
      "piv;": 982,
      "planck;": 8463,
      "planckh;": 8462,
      "plankv;": 8463,
      "plus;": 43,
      "plusacir;": 10787,
      "plusb;": 8862,
      "pluscir;": 10786,
      "plusdo;": 8724,
      "plusdu;": 10789,
      "pluse;": 10866,
      "plusmn": 177,
      "plusmn;": 177,
      "plussim;": 10790,
      "plustwo;": 10791,
      "pm;": 177,
      "pointint;": 10773,
      "popf;": [55349, 56673],
      "pound": 163,
      "pound;": 163,
      "pr;": 8826,
      "prE;": 10931,
      "prap;": 10935,
      "prcue;": 8828,
      "pre;": 10927,
      "prec;": 8826,
      "precapprox;": 10935,
      "preccurlyeq;": 8828,
      "preceq;": 10927,
      "precnapprox;": 10937,
      "precneqq;": 10933,
      "precnsim;": 8936,
      "precsim;": 8830,
      "prime;": 8242,
      "primes;": 8473,
      "prnE;": 10933,
      "prnap;": 10937,
      "prnsim;": 8936,
      "prod;": 8719,
      "profalar;": 9006,
      "profline;": 8978,
      "profsurf;": 8979,
      "prop;": 8733,
      "propto;": 8733,
      "prsim;": 8830,
      "prurel;": 8880,
      "pscr;": [55349, 56517],
      "psi;": 968,
      "puncsp;": 8200,
      "qfr;": [55349, 56622],
      "qint;": 10764,
      "qopf;": [55349, 56674],
      "qprime;": 8279,
      "qscr;": [55349, 56518],
      "quaternions;": 8461,
      "quatint;": 10774,
      "quest;": 63,
      "questeq;": 8799,
      "quot": 34,
      "quot;": 34,
      "rAarr;": 8667,
      "rArr;": 8658,
      "rAtail;": 10524,
      "rBarr;": 10511,
      "rHar;": 10596,
      "race;": [8765, 817],
      "racute;": 341,
      "radic;": 8730,
      "raemptyv;": 10675,
      "rang;": 10217,
      "rangd;": 10642,
      "range;": 10661,
      "rangle;": 10217,
      "raquo": 187,
      "raquo;": 187,
      "rarr;": 8594,
      "rarrap;": 10613,
      "rarrb;": 8677,
      "rarrbfs;": 10528,
      "rarrc;": 10547,
      "rarrfs;": 10526,
      "rarrhk;": 8618,
      "rarrlp;": 8620,
      "rarrpl;": 10565,
      "rarrsim;": 10612,
      "rarrtl;": 8611,
      "rarrw;": 8605,
      "ratail;": 10522,
      "ratio;": 8758,
      "rationals;": 8474,
      "rbarr;": 10509,
      "rbbrk;": 10099,
      "rbrace;": 125,
      "rbrack;": 93,
      "rbrke;": 10636,
      "rbrksld;": 10638,
      "rbrkslu;": 10640,
      "rcaron;": 345,
      "rcedil;": 343,
      "rceil;": 8969,
      "rcub;": 125,
      "rcy;": 1088,
      "rdca;": 10551,
      "rdldhar;": 10601,
      "rdquo;": 8221,
      "rdquor;": 8221,
      "rdsh;": 8627,
      "real;": 8476,
      "realine;": 8475,
      "realpart;": 8476,
      "reals;": 8477,
      "rect;": 9645,
      "reg": 174,
      "reg;": 174,
      "rfisht;": 10621,
      "rfloor;": 8971,
      "rfr;": [55349, 56623],
      "rhard;": 8641,
      "rharu;": 8640,
      "rharul;": 10604,
      "rho;": 961,
      "rhov;": 1009,
      "rightarrow;": 8594,
      "rightarrowtail;": 8611,
      "rightharpoondown;": 8641,
      "rightharpoonup;": 8640,
      "rightleftarrows;": 8644,
      "rightleftharpoons;": 8652,
      "rightrightarrows;": 8649,
      "rightsquigarrow;": 8605,
      "rightthreetimes;": 8908,
      "ring;": 730,
      "risingdotseq;": 8787,
      "rlarr;": 8644,
      "rlhar;": 8652,
      "rlm;": 8207,
      "rmoust;": 9137,
      "rmoustache;": 9137,
      "rnmid;": 10990,
      "roang;": 10221,
      "roarr;": 8702,
      "robrk;": 10215,
      "ropar;": 10630,
      "ropf;": [55349, 56675],
      "roplus;": 10798,
      "rotimes;": 10805,
      "rpar;": 41,
      "rpargt;": 10644,
      "rppolint;": 10770,
      "rrarr;": 8649,
      "rsaquo;": 8250,
      "rscr;": [55349, 56519],
      "rsh;": 8625,
      "rsqb;": 93,
      "rsquo;": 8217,
      "rsquor;": 8217,
      "rthree;": 8908,
      "rtimes;": 8906,
      "rtri;": 9657,
      "rtrie;": 8885,
      "rtrif;": 9656,
      "rtriltri;": 10702,
      "ruluhar;": 10600,
      "rx;": 8478,
      "sacute;": 347,
      "sbquo;": 8218,
      "sc;": 8827,
      "scE;": 10932,
      "scap;": 10936,
      "scaron;": 353,
      "sccue;": 8829,
      "sce;": 10928,
      "scedil;": 351,
      "scirc;": 349,
      "scnE;": 10934,
      "scnap;": 10938,
      "scnsim;": 8937,
      "scpolint;": 10771,
      "scsim;": 8831,
      "scy;": 1089,
      "sdot;": 8901,
      "sdotb;": 8865,
      "sdote;": 10854,
      "seArr;": 8664,
      "searhk;": 10533,
      "searr;": 8600,
      "searrow;": 8600,
      "sect": 167,
      "sect;": 167,
      "semi;": 59,
      "seswar;": 10537,
      "setminus;": 8726,
      "setmn;": 8726,
      "sext;": 10038,
      "sfr;": [55349, 56624],
      "sfrown;": 8994,
      "sharp;": 9839,
      "shchcy;": 1097,
      "shcy;": 1096,
      "shortmid;": 8739,
      "shortparallel;": 8741,
      "shy": 173,
      "shy;": 173,
      "sigma;": 963,
      "sigmaf;": 962,
      "sigmav;": 962,
      "sim;": 8764,
      "simdot;": 10858,
      "sime;": 8771,
      "simeq;": 8771,
      "simg;": 10910,
      "simgE;": 10912,
      "siml;": 10909,
      "simlE;": 10911,
      "simne;": 8774,
      "simplus;": 10788,
      "simrarr;": 10610,
      "slarr;": 8592,
      "smallsetminus;": 8726,
      "smashp;": 10803,
      "smeparsl;": 10724,
      "smid;": 8739,
      "smile;": 8995,
      "smt;": 10922,
      "smte;": 10924,
      "smtes;": [10924, 65024],
      "softcy;": 1100,
      "sol;": 47,
      "solb;": 10692,
      "solbar;": 9023,
      "sopf;": [55349, 56676],
      "spades;": 9824,
      "spadesuit;": 9824,
      "spar;": 8741,
      "sqcap;": 8851,
      "sqcaps;": [8851, 65024],
      "sqcup;": 8852,
      "sqcups;": [8852, 65024],
      "sqsub;": 8847,
      "sqsube;": 8849,
      "sqsubset;": 8847,
      "sqsubseteq;": 8849,
      "sqsup;": 8848,
      "sqsupe;": 8850,
      "sqsupset;": 8848,
      "sqsupseteq;": 8850,
      "squ;": 9633,
      "square;": 9633,
      "squarf;": 9642,
      "squf;": 9642,
      "srarr;": 8594,
      "sscr;": [55349, 56520],
      "ssetmn;": 8726,
      "ssmile;": 8995,
      "sstarf;": 8902,
      "star;": 9734,
      "starf;": 9733,
      "straightepsilon;": 1013,
      "straightphi;": 981,
      "strns;": 175,
      "sub;": 8834,
      "subE;": 10949,
      "subdot;": 10941,
      "sube;": 8838,
      "subedot;": 10947,
      "submult;": 10945,
      "subnE;": 10955,
      "subne;": 8842,
      "subplus;": 10943,
      "subrarr;": 10617,
      "subset;": 8834,
      "subseteq;": 8838,
      "subseteqq;": 10949,
      "subsetneq;": 8842,
      "subsetneqq;": 10955,
      "subsim;": 10951,
      "subsub;": 10965,
      "subsup;": 10963,
      "succ;": 8827,
      "succapprox;": 10936,
      "succcurlyeq;": 8829,
      "succeq;": 10928,
      "succnapprox;": 10938,
      "succneqq;": 10934,
      "succnsim;": 8937,
      "succsim;": 8831,
      "sum;": 8721,
      "sung;": 9834,
      "sup1": 185,
      "sup1;": 185,
      "sup2": 178,
      "sup2;": 178,
      "sup3": 179,
      "sup3;": 179,
      "sup;": 8835,
      "supE;": 10950,
      "supdot;": 10942,
      "supdsub;": 10968,
      "supe;": 8839,
      "supedot;": 10948,
      "suphsol;": 10185,
      "suphsub;": 10967,
      "suplarr;": 10619,
      "supmult;": 10946,
      "supnE;": 10956,
      "supne;": 8843,
      "supplus;": 10944,
      "supset;": 8835,
      "supseteq;": 8839,
      "supseteqq;": 10950,
      "supsetneq;": 8843,
      "supsetneqq;": 10956,
      "supsim;": 10952,
      "supsub;": 10964,
      "supsup;": 10966,
      "swArr;": 8665,
      "swarhk;": 10534,
      "swarr;": 8601,
      "swarrow;": 8601,
      "swnwar;": 10538,
      "szlig": 223,
      "szlig;": 223,
      "target;": 8982,
      "tau;": 964,
      "tbrk;": 9140,
      "tcaron;": 357,
      "tcedil;": 355,
      "tcy;": 1090,
      "tdot;": 8411,
      "telrec;": 8981,
      "tfr;": [55349, 56625],
      "there4;": 8756,
      "therefore;": 8756,
      "theta;": 952,
      "thetasym;": 977,
      "thetav;": 977,
      "thickapprox;": 8776,
      "thicksim;": 8764,
      "thinsp;": 8201,
      "thkap;": 8776,
      "thksim;": 8764,
      "thorn": 254,
      "thorn;": 254,
      "tilde;": 732,
      "times": 215,
      "times;": 215,
      "timesb;": 8864,
      "timesbar;": 10801,
      "timesd;": 10800,
      "tint;": 8749,
      "toea;": 10536,
      "top;": 8868,
      "topbot;": 9014,
      "topcir;": 10993,
      "topf;": [55349, 56677],
      "topfork;": 10970,
      "tosa;": 10537,
      "tprime;": 8244,
      "trade;": 8482,
      "triangle;": 9653,
      "triangledown;": 9663,
      "triangleleft;": 9667,
      "trianglelefteq;": 8884,
      "triangleq;": 8796,
      "triangleright;": 9657,
      "trianglerighteq;": 8885,
      "tridot;": 9708,
      "trie;": 8796,
      "triminus;": 10810,
      "triplus;": 10809,
      "trisb;": 10701,
      "tritime;": 10811,
      "trpezium;": 9186,
      "tscr;": [55349, 56521],
      "tscy;": 1094,
      "tshcy;": 1115,
      "tstrok;": 359,
      "twixt;": 8812,
      "twoheadleftarrow;": 8606,
      "twoheadrightarrow;": 8608,
      "uArr;": 8657,
      "uHar;": 10595,
      "uacute": 250,
      "uacute;": 250,
      "uarr;": 8593,
      "ubrcy;": 1118,
      "ubreve;": 365,
      "ucirc": 251,
      "ucirc;": 251,
      "ucy;": 1091,
      "udarr;": 8645,
      "udblac;": 369,
      "udhar;": 10606,
      "ufisht;": 10622,
      "ufr;": [55349, 56626],
      "ugrave": 249,
      "ugrave;": 249,
      "uharl;": 8639,
      "uharr;": 8638,
      "uhblk;": 9600,
      "ulcorn;": 8988,
      "ulcorner;": 8988,
      "ulcrop;": 8975,
      "ultri;": 9720,
      "umacr;": 363,
      "uml": 168,
      "uml;": 168,
      "uogon;": 371,
      "uopf;": [55349, 56678],
      "uparrow;": 8593,
      "updownarrow;": 8597,
      "upharpoonleft;": 8639,
      "upharpoonright;": 8638,
      "uplus;": 8846,
      "upsi;": 965,
      "upsih;": 978,
      "upsilon;": 965,
      "upuparrows;": 8648,
      "urcorn;": 8989,
      "urcorner;": 8989,
      "urcrop;": 8974,
      "uring;": 367,
      "urtri;": 9721,
      "uscr;": [55349, 56522],
      "utdot;": 8944,
      "utilde;": 361,
      "utri;": 9653,
      "utrif;": 9652,
      "uuarr;": 8648,
      "uuml": 252,
      "uuml;": 252,
      "uwangle;": 10663,
      "vArr;": 8661,
      "vBar;": 10984,
      "vBarv;": 10985,
      "vDash;": 8872,
      "vangrt;": 10652,
      "varepsilon;": 1013,
      "varkappa;": 1008,
      "varnothing;": 8709,
      "varphi;": 981,
      "varpi;": 982,
      "varpropto;": 8733,
      "varr;": 8597,
      "varrho;": 1009,
      "varsigma;": 962,
      "varsubsetneq;": [8842, 65024],
      "varsubsetneqq;": [10955, 65024],
      "varsupsetneq;": [8843, 65024],
      "varsupsetneqq;": [10956, 65024],
      "vartheta;": 977,
      "vartriangleleft;": 8882,
      "vartriangleright;": 8883,
      "vcy;": 1074,
      "vdash;": 8866,
      "vee;": 8744,
      "veebar;": 8891,
      "veeeq;": 8794,
      "vellip;": 8942,
      "verbar;": 124,
      "vert;": 124,
      "vfr;": [55349, 56627],
      "vltri;": 8882,
      "vnsub;": [8834, 8402],
      "vnsup;": [8835, 8402],
      "vopf;": [55349, 56679],
      "vprop;": 8733,
      "vrtri;": 8883,
      "vscr;": [55349, 56523],
      "vsubnE;": [10955, 65024],
      "vsubne;": [8842, 65024],
      "vsupnE;": [10956, 65024],
      "vsupne;": [8843, 65024],
      "vzigzag;": 10650,
      "wcirc;": 373,
      "wedbar;": 10847,
      "wedge;": 8743,
      "wedgeq;": 8793,
      "weierp;": 8472,
      "wfr;": [55349, 56628],
      "wopf;": [55349, 56680],
      "wp;": 8472,
      "wr;": 8768,
      "wreath;": 8768,
      "wscr;": [55349, 56524],
      "xcap;": 8898,
      "xcirc;": 9711,
      "xcup;": 8899,
      "xdtri;": 9661,
      "xfr;": [55349, 56629],
      "xhArr;": 10234,
      "xharr;": 10231,
      "xi;": 958,
      "xlArr;": 10232,
      "xlarr;": 10229,
      "xmap;": 10236,
      "xnis;": 8955,
      "xodot;": 10752,
      "xopf;": [55349, 56681],
      "xoplus;": 10753,
      "xotime;": 10754,
      "xrArr;": 10233,
      "xrarr;": 10230,
      "xscr;": [55349, 56525],
      "xsqcup;": 10758,
      "xuplus;": 10756,
      "xutri;": 9651,
      "xvee;": 8897,
      "xwedge;": 8896,
      "yacute": 253,
      "yacute;": 253,
      "yacy;": 1103,
      "ycirc;": 375,
      "ycy;": 1099,
      "yen": 165,
      "yen;": 165,
      "yfr;": [55349, 56630],
      "yicy;": 1111,
      "yopf;": [55349, 56682],
      "yscr;": [55349, 56526],
      "yucy;": 1102,
      "yuml": 255,
      "yuml;": 255,
      "zacute;": 378,
      "zcaron;": 382,
      "zcy;": 1079,
      "zdot;": 380,
      "zeetrf;": 8488,
      "zeta;": 950,
      "zfr;": [55349, 56631],
      "zhcy;": 1078,
      "zigrarr;": 8669,
      "zopf;": [55349, 56683],
      "zscr;": [55349, 56527],
      "zwj;": 8205,
      "zwnj;": 8204
    };
    var NAMEDCHARREF = /(A(?:Elig;?|MP;?|acute;?|breve;|c(?:irc;?|y;)|fr;|grave;?|lpha;|macr;|nd;|o(?:gon;|pf;)|pplyFunction;|ring;?|s(?:cr;|sign;)|tilde;?|uml;?)|B(?:a(?:ckslash;|r(?:v;|wed;))|cy;|e(?:cause;|rnoullis;|ta;)|fr;|opf;|reve;|scr;|umpeq;)|C(?:Hcy;|OPY;?|a(?:cute;|p(?:;|italDifferentialD;)|yleys;)|c(?:aron;|edil;?|irc;|onint;)|dot;|e(?:dilla;|nterDot;)|fr;|hi;|ircle(?:Dot;|Minus;|Plus;|Times;)|lo(?:ckwiseContourIntegral;|seCurly(?:DoubleQuote;|Quote;))|o(?:lon(?:;|e;)|n(?:gruent;|int;|tourIntegral;)|p(?:f;|roduct;)|unterClockwiseContourIntegral;)|ross;|scr;|up(?:;|Cap;))|D(?:D(?:;|otrahd;)|Jcy;|Scy;|Zcy;|a(?:gger;|rr;|shv;)|c(?:aron;|y;)|el(?:;|ta;)|fr;|i(?:a(?:critical(?:Acute;|Do(?:t;|ubleAcute;)|Grave;|Tilde;)|mond;)|fferentialD;)|o(?:pf;|t(?:;|Dot;|Equal;)|uble(?:ContourIntegral;|Do(?:t;|wnArrow;)|L(?:eft(?:Arrow;|RightArrow;|Tee;)|ong(?:Left(?:Arrow;|RightArrow;)|RightArrow;))|Right(?:Arrow;|Tee;)|Up(?:Arrow;|DownArrow;)|VerticalBar;)|wn(?:Arrow(?:;|Bar;|UpArrow;)|Breve;|Left(?:RightVector;|TeeVector;|Vector(?:;|Bar;))|Right(?:TeeVector;|Vector(?:;|Bar;))|Tee(?:;|Arrow;)|arrow;))|s(?:cr;|trok;))|E(?:NG;|TH;?|acute;?|c(?:aron;|irc;?|y;)|dot;|fr;|grave;?|lement;|m(?:acr;|pty(?:SmallSquare;|VerySmallSquare;))|o(?:gon;|pf;)|psilon;|qu(?:al(?:;|Tilde;)|ilibrium;)|s(?:cr;|im;)|ta;|uml;?|x(?:ists;|ponentialE;))|F(?:cy;|fr;|illed(?:SmallSquare;|VerySmallSquare;)|o(?:pf;|rAll;|uriertrf;)|scr;)|G(?:Jcy;|T;?|amma(?:;|d;)|breve;|c(?:edil;|irc;|y;)|dot;|fr;|g;|opf;|reater(?:Equal(?:;|Less;)|FullEqual;|Greater;|Less;|SlantEqual;|Tilde;)|scr;|t;)|H(?:ARDcy;|a(?:cek;|t;)|circ;|fr;|ilbertSpace;|o(?:pf;|rizontalLine;)|s(?:cr;|trok;)|ump(?:DownHump;|Equal;))|I(?:Ecy;|Jlig;|Ocy;|acute;?|c(?:irc;?|y;)|dot;|fr;|grave;?|m(?:;|a(?:cr;|ginaryI;)|plies;)|n(?:t(?:;|e(?:gral;|rsection;))|visible(?:Comma;|Times;))|o(?:gon;|pf;|ta;)|scr;|tilde;|u(?:kcy;|ml;?))|J(?:c(?:irc;|y;)|fr;|opf;|s(?:cr;|ercy;)|ukcy;)|K(?:Hcy;|Jcy;|appa;|c(?:edil;|y;)|fr;|opf;|scr;)|L(?:Jcy;|T;?|a(?:cute;|mbda;|ng;|placetrf;|rr;)|c(?:aron;|edil;|y;)|e(?:ft(?:A(?:ngleBracket;|rrow(?:;|Bar;|RightArrow;))|Ceiling;|Do(?:ubleBracket;|wn(?:TeeVector;|Vector(?:;|Bar;)))|Floor;|Right(?:Arrow;|Vector;)|T(?:ee(?:;|Arrow;|Vector;)|riangle(?:;|Bar;|Equal;))|Up(?:DownVector;|TeeVector;|Vector(?:;|Bar;))|Vector(?:;|Bar;)|arrow;|rightarrow;)|ss(?:EqualGreater;|FullEqual;|Greater;|Less;|SlantEqual;|Tilde;))|fr;|l(?:;|eftarrow;)|midot;|o(?:ng(?:Left(?:Arrow;|RightArrow;)|RightArrow;|left(?:arrow;|rightarrow;)|rightarrow;)|pf;|wer(?:LeftArrow;|RightArrow;))|s(?:cr;|h;|trok;)|t;)|M(?:ap;|cy;|e(?:diumSpace;|llintrf;)|fr;|inusPlus;|opf;|scr;|u;)|N(?:Jcy;|acute;|c(?:aron;|edil;|y;)|e(?:gative(?:MediumSpace;|Thi(?:ckSpace;|nSpace;)|VeryThinSpace;)|sted(?:GreaterGreater;|LessLess;)|wLine;)|fr;|o(?:Break;|nBreakingSpace;|pf;|t(?:;|C(?:ongruent;|upCap;)|DoubleVerticalBar;|E(?:lement;|qual(?:;|Tilde;)|xists;)|Greater(?:;|Equal;|FullEqual;|Greater;|Less;|SlantEqual;|Tilde;)|Hump(?:DownHump;|Equal;)|Le(?:ftTriangle(?:;|Bar;|Equal;)|ss(?:;|Equal;|Greater;|Less;|SlantEqual;|Tilde;))|Nested(?:GreaterGreater;|LessLess;)|Precedes(?:;|Equal;|SlantEqual;)|R(?:everseElement;|ightTriangle(?:;|Bar;|Equal;))|S(?:quareSu(?:bset(?:;|Equal;)|perset(?:;|Equal;))|u(?:bset(?:;|Equal;)|cceeds(?:;|Equal;|SlantEqual;|Tilde;)|perset(?:;|Equal;)))|Tilde(?:;|Equal;|FullEqual;|Tilde;)|VerticalBar;))|scr;|tilde;?|u;)|O(?:Elig;|acute;?|c(?:irc;?|y;)|dblac;|fr;|grave;?|m(?:acr;|ega;|icron;)|opf;|penCurly(?:DoubleQuote;|Quote;)|r;|s(?:cr;|lash;?)|ti(?:lde;?|mes;)|uml;?|ver(?:B(?:ar;|rac(?:e;|ket;))|Parenthesis;))|P(?:artialD;|cy;|fr;|hi;|i;|lusMinus;|o(?:incareplane;|pf;)|r(?:;|ecedes(?:;|Equal;|SlantEqual;|Tilde;)|ime;|o(?:duct;|portion(?:;|al;)))|s(?:cr;|i;))|Q(?:UOT;?|fr;|opf;|scr;)|R(?:Barr;|EG;?|a(?:cute;|ng;|rr(?:;|tl;))|c(?:aron;|edil;|y;)|e(?:;|verse(?:E(?:lement;|quilibrium;)|UpEquilibrium;))|fr;|ho;|ight(?:A(?:ngleBracket;|rrow(?:;|Bar;|LeftArrow;))|Ceiling;|Do(?:ubleBracket;|wn(?:TeeVector;|Vector(?:;|Bar;)))|Floor;|T(?:ee(?:;|Arrow;|Vector;)|riangle(?:;|Bar;|Equal;))|Up(?:DownVector;|TeeVector;|Vector(?:;|Bar;))|Vector(?:;|Bar;)|arrow;)|o(?:pf;|undImplies;)|rightarrow;|s(?:cr;|h;)|uleDelayed;)|S(?:H(?:CHcy;|cy;)|OFTcy;|acute;|c(?:;|aron;|edil;|irc;|y;)|fr;|hort(?:DownArrow;|LeftArrow;|RightArrow;|UpArrow;)|igma;|mallCircle;|opf;|q(?:rt;|uare(?:;|Intersection;|Su(?:bset(?:;|Equal;)|perset(?:;|Equal;))|Union;))|scr;|tar;|u(?:b(?:;|set(?:;|Equal;))|c(?:ceeds(?:;|Equal;|SlantEqual;|Tilde;)|hThat;)|m;|p(?:;|erset(?:;|Equal;)|set;)))|T(?:HORN;?|RADE;|S(?:Hcy;|cy;)|a(?:b;|u;)|c(?:aron;|edil;|y;)|fr;|h(?:e(?:refore;|ta;)|i(?:ckSpace;|nSpace;))|ilde(?:;|Equal;|FullEqual;|Tilde;)|opf;|ripleDot;|s(?:cr;|trok;))|U(?:a(?:cute;?|rr(?:;|ocir;))|br(?:cy;|eve;)|c(?:irc;?|y;)|dblac;|fr;|grave;?|macr;|n(?:der(?:B(?:ar;|rac(?:e;|ket;))|Parenthesis;)|ion(?:;|Plus;))|o(?:gon;|pf;)|p(?:Arrow(?:;|Bar;|DownArrow;)|DownArrow;|Equilibrium;|Tee(?:;|Arrow;)|arrow;|downarrow;|per(?:LeftArrow;|RightArrow;)|si(?:;|lon;))|ring;|scr;|tilde;|uml;?)|V(?:Dash;|bar;|cy;|dash(?:;|l;)|e(?:e;|r(?:bar;|t(?:;|ical(?:Bar;|Line;|Separator;|Tilde;))|yThinSpace;))|fr;|opf;|scr;|vdash;)|W(?:circ;|edge;|fr;|opf;|scr;)|X(?:fr;|i;|opf;|scr;)|Y(?:Acy;|Icy;|Ucy;|acute;?|c(?:irc;|y;)|fr;|opf;|scr;|uml;)|Z(?:Hcy;|acute;|c(?:aron;|y;)|dot;|e(?:roWidthSpace;|ta;)|fr;|opf;|scr;)|a(?:acute;?|breve;|c(?:;|E;|d;|irc;?|ute;?|y;)|elig;?|f(?:;|r;)|grave;?|l(?:e(?:fsym;|ph;)|pha;)|m(?:a(?:cr;|lg;)|p;?)|n(?:d(?:;|and;|d;|slope;|v;)|g(?:;|e;|le;|msd(?:;|a(?:a;|b;|c;|d;|e;|f;|g;|h;))|rt(?:;|vb(?:;|d;))|s(?:ph;|t;)|zarr;))|o(?:gon;|pf;)|p(?:;|E;|acir;|e;|id;|os;|prox(?:;|eq;))|ring;?|s(?:cr;|t;|ymp(?:;|eq;))|tilde;?|uml;?|w(?:conint;|int;))|b(?:Not;|a(?:ck(?:cong;|epsilon;|prime;|sim(?:;|eq;))|r(?:vee;|wed(?:;|ge;)))|brk(?:;|tbrk;)|c(?:ong;|y;)|dquo;|e(?:caus(?:;|e;)|mptyv;|psi;|rnou;|t(?:a;|h;|ween;))|fr;|ig(?:c(?:ap;|irc;|up;)|o(?:dot;|plus;|times;)|s(?:qcup;|tar;)|triangle(?:down;|up;)|uplus;|vee;|wedge;)|karow;|l(?:a(?:ck(?:lozenge;|square;|triangle(?:;|down;|left;|right;))|nk;)|k(?:1(?:2;|4;)|34;)|ock;)|n(?:e(?:;|quiv;)|ot;)|o(?:pf;|t(?:;|tom;)|wtie;|x(?:D(?:L;|R;|l;|r;)|H(?:;|D;|U;|d;|u;)|U(?:L;|R;|l;|r;)|V(?:;|H;|L;|R;|h;|l;|r;)|box;|d(?:L;|R;|l;|r;)|h(?:;|D;|U;|d;|u;)|minus;|plus;|times;|u(?:L;|R;|l;|r;)|v(?:;|H;|L;|R;|h;|l;|r;)))|prime;|r(?:eve;|vbar;?)|s(?:cr;|emi;|im(?:;|e;)|ol(?:;|b;|hsub;))|u(?:ll(?:;|et;)|mp(?:;|E;|e(?:;|q;))))|c(?:a(?:cute;|p(?:;|and;|brcup;|c(?:ap;|up;)|dot;|s;)|r(?:et;|on;))|c(?:a(?:ps;|ron;)|edil;?|irc;|ups(?:;|sm;))|dot;|e(?:dil;?|mptyv;|nt(?:;|erdot;|))|fr;|h(?:cy;|eck(?:;|mark;)|i;)|ir(?:;|E;|c(?:;|eq;|le(?:arrow(?:left;|right;)|d(?:R;|S;|ast;|circ;|dash;)))|e;|fnint;|mid;|scir;)|lubs(?:;|uit;)|o(?:lon(?:;|e(?:;|q;))|m(?:ma(?:;|t;)|p(?:;|fn;|le(?:ment;|xes;)))|n(?:g(?:;|dot;)|int;)|p(?:f;|rod;|y(?:;|sr;|)))|r(?:arr;|oss;)|s(?:cr;|u(?:b(?:;|e;)|p(?:;|e;)))|tdot;|u(?:darr(?:l;|r;)|e(?:pr;|sc;)|larr(?:;|p;)|p(?:;|brcap;|c(?:ap;|up;)|dot;|or;|s;)|r(?:arr(?:;|m;)|ly(?:eq(?:prec;|succ;)|vee;|wedge;)|ren;?|vearrow(?:left;|right;))|vee;|wed;)|w(?:conint;|int;)|ylcty;)|d(?:Arr;|Har;|a(?:gger;|leth;|rr;|sh(?:;|v;))|b(?:karow;|lac;)|c(?:aron;|y;)|d(?:;|a(?:gger;|rr;)|otseq;)|e(?:g;?|lta;|mptyv;)|f(?:isht;|r;)|har(?:l;|r;)|i(?:am(?:;|ond(?:;|suit;)|s;)|e;|gamma;|sin;|v(?:;|ide(?:;|ontimes;|)|onx;))|jcy;|lc(?:orn;|rop;)|o(?:llar;|pf;|t(?:;|eq(?:;|dot;)|minus;|plus;|square;)|ublebarwedge;|wn(?:arrow;|downarrows;|harpoon(?:left;|right;)))|r(?:bkarow;|c(?:orn;|rop;))|s(?:c(?:r;|y;)|ol;|trok;)|t(?:dot;|ri(?:;|f;))|u(?:arr;|har;)|wangle;|z(?:cy;|igrarr;))|e(?:D(?:Dot;|ot;)|a(?:cute;?|ster;)|c(?:aron;|ir(?:;|c;?)|olon;|y;)|dot;|e;|f(?:Dot;|r;)|g(?:;|rave;?|s(?:;|dot;))|l(?:;|inters;|l;|s(?:;|dot;))|m(?:acr;|pty(?:;|set;|v;)|sp(?:1(?:3;|4;)|;))|n(?:g;|sp;)|o(?:gon;|pf;)|p(?:ar(?:;|sl;)|lus;|si(?:;|lon;|v;))|q(?:c(?:irc;|olon;)|s(?:im;|lant(?:gtr;|less;))|u(?:als;|est;|iv(?:;|DD;))|vparsl;)|r(?:Dot;|arr;)|s(?:cr;|dot;|im;)|t(?:a;|h;?)|u(?:ml;?|ro;)|x(?:cl;|ist;|p(?:ectation;|onentiale;)))|f(?:allingdotseq;|cy;|emale;|f(?:ilig;|l(?:ig;|lig;)|r;)|ilig;|jlig;|l(?:at;|lig;|tns;)|nof;|o(?:pf;|r(?:all;|k(?:;|v;)))|partint;|r(?:a(?:c(?:1(?:2;?|3;|4;?|5;|6;|8;)|2(?:3;|5;)|3(?:4;?|5;|8;)|45;|5(?:6;|8;)|78;)|sl;)|own;)|scr;)|g(?:E(?:;|l;)|a(?:cute;|mma(?:;|d;)|p;)|breve;|c(?:irc;|y;)|dot;|e(?:;|l;|q(?:;|q;|slant;)|s(?:;|cc;|dot(?:;|o(?:;|l;))|l(?:;|es;)))|fr;|g(?:;|g;)|imel;|jcy;|l(?:;|E;|a;|j;)|n(?:E;|ap(?:;|prox;)|e(?:;|q(?:;|q;))|sim;)|opf;|rave;|s(?:cr;|im(?:;|e;|l;))|t(?:;|c(?:c;|ir;)|dot;|lPar;|quest;|r(?:a(?:pprox;|rr;)|dot;|eq(?:less;|qless;)|less;|sim;)|)|v(?:ertneqq;|nE;))|h(?:Arr;|a(?:irsp;|lf;|milt;|r(?:dcy;|r(?:;|cir;|w;)))|bar;|circ;|e(?:arts(?:;|uit;)|llip;|rcon;)|fr;|ks(?:earow;|warow;)|o(?:arr;|mtht;|ok(?:leftarrow;|rightarrow;)|pf;|rbar;)|s(?:cr;|lash;|trok;)|y(?:bull;|phen;))|i(?:acute;?|c(?:;|irc;?|y;)|e(?:cy;|xcl;?)|f(?:f;|r;)|grave;?|i(?:;|i(?:int;|nt;)|nfin;|ota;)|jlig;|m(?:a(?:cr;|g(?:e;|line;|part;)|th;)|of;|ped;)|n(?:;|care;|fin(?:;|tie;)|odot;|t(?:;|cal;|e(?:gers;|rcal;)|larhk;|prod;))|o(?:cy;|gon;|pf;|ta;)|prod;|quest;?|s(?:cr;|in(?:;|E;|dot;|s(?:;|v;)|v;))|t(?:;|ilde;)|u(?:kcy;|ml;?))|j(?:c(?:irc;|y;)|fr;|math;|opf;|s(?:cr;|ercy;)|ukcy;)|k(?:appa(?:;|v;)|c(?:edil;|y;)|fr;|green;|hcy;|jcy;|opf;|scr;)|l(?:A(?:arr;|rr;|tail;)|Barr;|E(?:;|g;)|Har;|a(?:cute;|emptyv;|gran;|mbda;|ng(?:;|d;|le;)|p;|quo;?|rr(?:;|b(?:;|fs;)|fs;|hk;|lp;|pl;|sim;|tl;)|t(?:;|ail;|e(?:;|s;)))|b(?:arr;|brk;|r(?:ac(?:e;|k;)|k(?:e;|sl(?:d;|u;))))|c(?:aron;|e(?:dil;|il;)|ub;|y;)|d(?:ca;|quo(?:;|r;)|r(?:dhar;|ushar;)|sh;)|e(?:;|ft(?:arrow(?:;|tail;)|harpoon(?:down;|up;)|leftarrows;|right(?:arrow(?:;|s;)|harpoons;|squigarrow;)|threetimes;)|g;|q(?:;|q;|slant;)|s(?:;|cc;|dot(?:;|o(?:;|r;))|g(?:;|es;)|s(?:approx;|dot;|eq(?:gtr;|qgtr;)|gtr;|sim;)))|f(?:isht;|loor;|r;)|g(?:;|E;)|h(?:ar(?:d;|u(?:;|l;))|blk;)|jcy;|l(?:;|arr;|corner;|hard;|tri;)|m(?:idot;|oust(?:;|ache;))|n(?:E;|ap(?:;|prox;)|e(?:;|q(?:;|q;))|sim;)|o(?:a(?:ng;|rr;)|brk;|ng(?:left(?:arrow;|rightarrow;)|mapsto;|rightarrow;)|oparrow(?:left;|right;)|p(?:ar;|f;|lus;)|times;|w(?:ast;|bar;)|z(?:;|enge;|f;))|par(?:;|lt;)|r(?:arr;|corner;|har(?:;|d;)|m;|tri;)|s(?:aquo;|cr;|h;|im(?:;|e;|g;)|q(?:b;|uo(?:;|r;))|trok;)|t(?:;|c(?:c;|ir;)|dot;|hree;|imes;|larr;|quest;|r(?:Par;|i(?:;|e;|f;))|)|ur(?:dshar;|uhar;)|v(?:ertneqq;|nE;))|m(?:DDot;|a(?:cr;?|l(?:e;|t(?:;|ese;))|p(?:;|sto(?:;|down;|left;|up;))|rker;)|c(?:omma;|y;)|dash;|easuredangle;|fr;|ho;|i(?:cro;?|d(?:;|ast;|cir;|dot;?)|nus(?:;|b;|d(?:;|u;)))|l(?:cp;|dr;)|nplus;|o(?:dels;|pf;)|p;|s(?:cr;|tpos;)|u(?:;|ltimap;|map;))|n(?:G(?:g;|t(?:;|v;))|L(?:eft(?:arrow;|rightarrow;)|l;|t(?:;|v;))|Rightarrow;|V(?:Dash;|dash;)|a(?:bla;|cute;|ng;|p(?:;|E;|id;|os;|prox;)|tur(?:;|al(?:;|s;)))|b(?:sp;?|ump(?:;|e;))|c(?:a(?:p;|ron;)|edil;|ong(?:;|dot;)|up;|y;)|dash;|e(?:;|Arr;|ar(?:hk;|r(?:;|ow;))|dot;|quiv;|s(?:ear;|im;)|xist(?:;|s;))|fr;|g(?:E;|e(?:;|q(?:;|q;|slant;)|s;)|sim;|t(?:;|r;))|h(?:Arr;|arr;|par;)|i(?:;|s(?:;|d;)|v;)|jcy;|l(?:Arr;|E;|arr;|dr;|e(?:;|ft(?:arrow;|rightarrow;)|q(?:;|q;|slant;)|s(?:;|s;))|sim;|t(?:;|ri(?:;|e;)))|mid;|o(?:pf;|t(?:;|in(?:;|E;|dot;|v(?:a;|b;|c;))|ni(?:;|v(?:a;|b;|c;))|))|p(?:ar(?:;|allel;|sl;|t;)|olint;|r(?:;|cue;|e(?:;|c(?:;|eq;))))|r(?:Arr;|arr(?:;|c;|w;)|ightarrow;|tri(?:;|e;))|s(?:c(?:;|cue;|e;|r;)|hort(?:mid;|parallel;)|im(?:;|e(?:;|q;))|mid;|par;|qsu(?:be;|pe;)|u(?:b(?:;|E;|e;|set(?:;|eq(?:;|q;)))|cc(?:;|eq;)|p(?:;|E;|e;|set(?:;|eq(?:;|q;)))))|t(?:gl;|ilde;?|lg;|riangle(?:left(?:;|eq;)|right(?:;|eq;)))|u(?:;|m(?:;|ero;|sp;))|v(?:Dash;|Harr;|ap;|dash;|g(?:e;|t;)|infin;|l(?:Arr;|e;|t(?:;|rie;))|r(?:Arr;|trie;)|sim;)|w(?:Arr;|ar(?:hk;|r(?:;|ow;))|near;))|o(?:S;|a(?:cute;?|st;)|c(?:ir(?:;|c;?)|y;)|d(?:ash;|blac;|iv;|ot;|sold;)|elig;|f(?:cir;|r;)|g(?:on;|rave;?|t;)|h(?:bar;|m;)|int;|l(?:arr;|c(?:ir;|ross;)|ine;|t;)|m(?:acr;|ega;|i(?:cron;|d;|nus;))|opf;|p(?:ar;|erp;|lus;)|r(?:;|arr;|d(?:;|er(?:;|of;)|f;?|m;?)|igof;|or;|slope;|v;)|s(?:cr;|lash;?|ol;)|ti(?:lde;?|mes(?:;|as;))|uml;?|vbar;)|p(?:ar(?:;|a(?:;|llel;|)|s(?:im;|l;)|t;)|cy;|er(?:cnt;|iod;|mil;|p;|tenk;)|fr;|h(?:i(?:;|v;)|mmat;|one;)|i(?:;|tchfork;|v;)|l(?:an(?:ck(?:;|h;)|kv;)|us(?:;|acir;|b;|cir;|d(?:o;|u;)|e;|mn;?|sim;|two;))|m;|o(?:intint;|pf;|und;?)|r(?:;|E;|ap;|cue;|e(?:;|c(?:;|approx;|curlyeq;|eq;|n(?:approx;|eqq;|sim;)|sim;))|ime(?:;|s;)|n(?:E;|ap;|sim;)|o(?:d;|f(?:alar;|line;|surf;)|p(?:;|to;))|sim;|urel;)|s(?:cr;|i;)|uncsp;)|q(?:fr;|int;|opf;|prime;|scr;|u(?:at(?:ernions;|int;)|est(?:;|eq;)|ot;?))|r(?:A(?:arr;|rr;|tail;)|Barr;|Har;|a(?:c(?:e;|ute;)|dic;|emptyv;|ng(?:;|d;|e;|le;)|quo;?|rr(?:;|ap;|b(?:;|fs;)|c;|fs;|hk;|lp;|pl;|sim;|tl;|w;)|t(?:ail;|io(?:;|nals;)))|b(?:arr;|brk;|r(?:ac(?:e;|k;)|k(?:e;|sl(?:d;|u;))))|c(?:aron;|e(?:dil;|il;)|ub;|y;)|d(?:ca;|ldhar;|quo(?:;|r;)|sh;)|e(?:al(?:;|ine;|part;|s;)|ct;|g;?)|f(?:isht;|loor;|r;)|h(?:ar(?:d;|u(?:;|l;))|o(?:;|v;))|i(?:ght(?:arrow(?:;|tail;)|harpoon(?:down;|up;)|left(?:arrows;|harpoons;)|rightarrows;|squigarrow;|threetimes;)|ng;|singdotseq;)|l(?:arr;|har;|m;)|moust(?:;|ache;)|nmid;|o(?:a(?:ng;|rr;)|brk;|p(?:ar;|f;|lus;)|times;)|p(?:ar(?:;|gt;)|polint;)|rarr;|s(?:aquo;|cr;|h;|q(?:b;|uo(?:;|r;)))|t(?:hree;|imes;|ri(?:;|e;|f;|ltri;))|uluhar;|x;)|s(?:acute;|bquo;|c(?:;|E;|a(?:p;|ron;)|cue;|e(?:;|dil;)|irc;|n(?:E;|ap;|sim;)|polint;|sim;|y;)|dot(?:;|b;|e;)|e(?:Arr;|ar(?:hk;|r(?:;|ow;))|ct;?|mi;|swar;|tm(?:inus;|n;)|xt;)|fr(?:;|own;)|h(?:arp;|c(?:hcy;|y;)|ort(?:mid;|parallel;)|y;?)|i(?:gma(?:;|f;|v;)|m(?:;|dot;|e(?:;|q;)|g(?:;|E;)|l(?:;|E;)|ne;|plus;|rarr;))|larr;|m(?:a(?:llsetminus;|shp;)|eparsl;|i(?:d;|le;)|t(?:;|e(?:;|s;)))|o(?:ftcy;|l(?:;|b(?:;|ar;))|pf;)|pa(?:des(?:;|uit;)|r;)|q(?:c(?:ap(?:;|s;)|up(?:;|s;))|su(?:b(?:;|e;|set(?:;|eq;))|p(?:;|e;|set(?:;|eq;)))|u(?:;|ar(?:e;|f;)|f;))|rarr;|s(?:cr;|etmn;|mile;|tarf;)|t(?:ar(?:;|f;)|r(?:aight(?:epsilon;|phi;)|ns;))|u(?:b(?:;|E;|dot;|e(?:;|dot;)|mult;|n(?:E;|e;)|plus;|rarr;|s(?:et(?:;|eq(?:;|q;)|neq(?:;|q;))|im;|u(?:b;|p;)))|cc(?:;|approx;|curlyeq;|eq;|n(?:approx;|eqq;|sim;)|sim;)|m;|ng;|p(?:1;?|2;?|3;?|;|E;|d(?:ot;|sub;)|e(?:;|dot;)|hs(?:ol;|ub;)|larr;|mult;|n(?:E;|e;)|plus;|s(?:et(?:;|eq(?:;|q;)|neq(?:;|q;))|im;|u(?:b;|p;))))|w(?:Arr;|ar(?:hk;|r(?:;|ow;))|nwar;)|zlig;?)|t(?:a(?:rget;|u;)|brk;|c(?:aron;|edil;|y;)|dot;|elrec;|fr;|h(?:e(?:re(?:4;|fore;)|ta(?:;|sym;|v;))|i(?:ck(?:approx;|sim;)|nsp;)|k(?:ap;|sim;)|orn;?)|i(?:lde;|mes(?:;|b(?:;|ar;)|d;|)|nt;)|o(?:ea;|p(?:;|bot;|cir;|f(?:;|ork;))|sa;)|prime;|r(?:ade;|i(?:angle(?:;|down;|left(?:;|eq;)|q;|right(?:;|eq;))|dot;|e;|minus;|plus;|sb;|time;)|pezium;)|s(?:c(?:r;|y;)|hcy;|trok;)|w(?:ixt;|ohead(?:leftarrow;|rightarrow;)))|u(?:Arr;|Har;|a(?:cute;?|rr;)|br(?:cy;|eve;)|c(?:irc;?|y;)|d(?:arr;|blac;|har;)|f(?:isht;|r;)|grave;?|h(?:ar(?:l;|r;)|blk;)|l(?:c(?:orn(?:;|er;)|rop;)|tri;)|m(?:acr;|l;?)|o(?:gon;|pf;)|p(?:arrow;|downarrow;|harpoon(?:left;|right;)|lus;|si(?:;|h;|lon;)|uparrows;)|r(?:c(?:orn(?:;|er;)|rop;)|ing;|tri;)|scr;|t(?:dot;|ilde;|ri(?:;|f;))|u(?:arr;|ml;?)|wangle;)|v(?:Arr;|Bar(?:;|v;)|Dash;|a(?:ngrt;|r(?:epsilon;|kappa;|nothing;|p(?:hi;|i;|ropto;)|r(?:;|ho;)|s(?:igma;|u(?:bsetneq(?:;|q;)|psetneq(?:;|q;)))|t(?:heta;|riangle(?:left;|right;))))|cy;|dash;|e(?:e(?:;|bar;|eq;)|llip;|r(?:bar;|t;))|fr;|ltri;|nsu(?:b;|p;)|opf;|prop;|rtri;|s(?:cr;|u(?:bn(?:E;|e;)|pn(?:E;|e;)))|zigzag;)|w(?:circ;|e(?:d(?:bar;|ge(?:;|q;))|ierp;)|fr;|opf;|p;|r(?:;|eath;)|scr;)|x(?:c(?:ap;|irc;|up;)|dtri;|fr;|h(?:Arr;|arr;)|i;|l(?:Arr;|arr;)|map;|nis;|o(?:dot;|p(?:f;|lus;)|time;)|r(?:Arr;|arr;)|s(?:cr;|qcup;)|u(?:plus;|tri;)|vee;|wedge;)|y(?:ac(?:ute;?|y;)|c(?:irc;|y;)|en;?|fr;|icy;|opf;|scr;|u(?:cy;|ml;?))|z(?:acute;|c(?:aron;|y;)|dot;|e(?:etrf;|ta;)|fr;|hcy;|igrarr;|opf;|scr;|w(?:j;|nj;)))|[\s\S]/g;
    var NAMEDCHARREF_MAXLEN = 32;
    var DBLQUOTEATTRVAL = /[^\r"&\u0000]+/g;
    var SINGLEQUOTEATTRVAL = /[^\r'&\u0000]+/g;
    var UNQUOTEDATTRVAL = /[^\r\t\n\f &>\u0000]+/g;
    var TAGNAME = /[^\r\t\n\f \/>A-Z\u0000]+/g;
    var ATTRNAME = /[^\r\t\n\f \/=>A-Z\u0000]+/g;
    var CDATATEXT = /[^\]\r\u0000\uffff]*/g;
    var DATATEXT = /[^&<\r\u0000\uffff]*/g;
    var RAWTEXT = /[^<\r\u0000\uffff]*/g;
    var PLAINTEXT = /[^\r\u0000\uffff]*/g;
    var SIMPLETAG = /(?:(\/)?([a-z]+)>)|[\s\S]/g;
    var SIMPLEATTR = /(?:([-a-z]+)[ \t\n\f]*=[ \t\n\f]*('[^'&\r\u0000]*'|"[^"&\r\u0000]*"|[^\t\n\r\f "&'\u0000>][^&> \t\n\r\f\u0000]*[ \t\n\f]))|[\s\S]/g;
    var NONWS = /[^\x09\x0A\x0C\x0D\x20]/;
    var ALLNONWS = /[^\x09\x0A\x0C\x0D\x20]/g;
    var NONWSNONNUL = /[^\x00\x09\x0A\x0C\x0D\x20]/;
    var LEADINGWS = /^[\x09\x0A\x0C\x0D\x20]+/;
    var NULCHARS = /\x00/g;
    function buf2str(buf) {
      var CHUNKSIZE = 16384;
      if (buf.length < CHUNKSIZE) {
        return String.fromCharCode.apply(String, buf);
      }
      var result = "";
      for (var i = 0; i < buf.length; i += CHUNKSIZE) {
        result += String.fromCharCode.apply(String, buf.slice(i, i + CHUNKSIZE));
      }
      return result;
    }
    function str2buf(s) {
      var result = [];
      for (var i = 0; i < s.length; i++) {
        result[i] = s.charCodeAt(i);
      }
      return result;
    }
    function isA(elt, set) {
      if (typeof set === "string") {
        return elt.namespaceURI === NAMESPACE.HTML && elt.localName === set;
      }
      var tagnames = set[elt.namespaceURI];
      return tagnames && tagnames[elt.localName];
    }
    function isMathmlTextIntegrationPoint(n) {
      return isA(n, mathmlTextIntegrationPointSet);
    }
    function isHTMLIntegrationPoint(n) {
      if (isA(n, htmlIntegrationPointSet)) return true;
      if (n.namespaceURI === NAMESPACE.MATHML && n.localName === "annotation-xml") {
        var encoding = n.getAttribute("encoding");
        if (encoding) encoding = encoding.toLowerCase();
        if (encoding === "text/html" || encoding === "application/xhtml+xml")
          return true;
      }
      return false;
    }
    function adjustSVGTagName(name) {
      if (name in svgTagNameAdjustments)
        return svgTagNameAdjustments[name];
      else
        return name;
    }
    function adjustSVGAttributes(attrs) {
      for (var i = 0, n = attrs.length; i < n; i++) {
        if (attrs[i][0] in svgAttrAdjustments) {
          attrs[i][0] = svgAttrAdjustments[attrs[i][0]];
        }
      }
    }
    function adjustMathMLAttributes(attrs) {
      for (var i = 0, n = attrs.length; i < n; i++) {
        if (attrs[i][0] === "definitionurl") {
          attrs[i][0] = "definitionURL";
          break;
        }
      }
    }
    function adjustForeignAttributes(attrs) {
      for (var i = 0, n = attrs.length; i < n; i++) {
        if (attrs[i][0] in foreignAttributes) {
          attrs[i].push(foreignAttributes[attrs[i][0]]);
        }
      }
    }
    function transferAttributes(attrs, elt) {
      for (var i = 0, n = attrs.length; i < n; i++) {
        var name = attrs[i][0], value = attrs[i][1];
        if (elt.hasAttribute(name)) continue;
        elt._setAttribute(name, value);
      }
    }
    HTMLParser.ElementStack = function ElementStack() {
      this.elements = [];
      this.top = null;
    };
    HTMLParser.ElementStack.prototype.push = function(e) {
      this.elements.push(e);
      this.top = e;
    };
    HTMLParser.ElementStack.prototype.pop = function(e) {
      this.elements.pop();
      this.top = this.elements[this.elements.length - 1];
    };
    HTMLParser.ElementStack.prototype.popTag = function(tag) {
      for (var i = this.elements.length - 1; i > 0; i--) {
        var e = this.elements[i];
        if (isA(e, tag)) break;
      }
      this.elements.length = i;
      this.top = this.elements[i - 1];
    };
    HTMLParser.ElementStack.prototype.popElementType = function(type) {
      for (var i = this.elements.length - 1; i > 0; i--) {
        if (this.elements[i] instanceof type) break;
      }
      this.elements.length = i;
      this.top = this.elements[i - 1];
    };
    HTMLParser.ElementStack.prototype.popElement = function(e) {
      for (var i = this.elements.length - 1; i > 0; i--) {
        if (this.elements[i] === e) break;
      }
      this.elements.length = i;
      this.top = this.elements[i - 1];
    };
    HTMLParser.ElementStack.prototype.removeElement = function(e) {
      if (this.top === e) this.pop();
      else {
        var idx = this.elements.lastIndexOf(e);
        if (idx !== -1)
          this.elements.splice(idx, 1);
      }
    };
    HTMLParser.ElementStack.prototype.clearToContext = function(set) {
      for (var i = this.elements.length - 1; i > 0; i--) {
        if (isA(this.elements[i], set)) break;
      }
      this.elements.length = i + 1;
      this.top = this.elements[i];
    };
    HTMLParser.ElementStack.prototype.contains = function(tag) {
      return this.inSpecificScope(tag, /* @__PURE__ */ Object.create(null));
    };
    HTMLParser.ElementStack.prototype.inSpecificScope = function(tag, set) {
      for (var i = this.elements.length - 1; i >= 0; i--) {
        var elt = this.elements[i];
        if (isA(elt, tag)) return true;
        if (isA(elt, set)) return false;
      }
      return false;
    };
    HTMLParser.ElementStack.prototype.elementInSpecificScope = function(target, set) {
      for (var i = this.elements.length - 1; i >= 0; i--) {
        var elt = this.elements[i];
        if (elt === target) return true;
        if (isA(elt, set)) return false;
      }
      return false;
    };
    HTMLParser.ElementStack.prototype.elementTypeInSpecificScope = function(target, set) {
      for (var i = this.elements.length - 1; i >= 0; i--) {
        var elt = this.elements[i];
        if (elt instanceof target) return true;
        if (isA(elt, set)) return false;
      }
      return false;
    };
    HTMLParser.ElementStack.prototype.inScope = function(tag) {
      return this.inSpecificScope(tag, inScopeSet);
    };
    HTMLParser.ElementStack.prototype.elementInScope = function(e) {
      return this.elementInSpecificScope(e, inScopeSet);
    };
    HTMLParser.ElementStack.prototype.elementTypeInScope = function(type) {
      return this.elementTypeInSpecificScope(type, inScopeSet);
    };
    HTMLParser.ElementStack.prototype.inButtonScope = function(tag) {
      return this.inSpecificScope(tag, inButtonScopeSet);
    };
    HTMLParser.ElementStack.prototype.inListItemScope = function(tag) {
      return this.inSpecificScope(tag, inListItemScopeSet);
    };
    HTMLParser.ElementStack.prototype.inTableScope = function(tag) {
      return this.inSpecificScope(tag, inTableScopeSet);
    };
    HTMLParser.ElementStack.prototype.inSelectScope = function(tag) {
      for (var i = this.elements.length - 1; i >= 0; i--) {
        var elt = this.elements[i];
        if (elt.namespaceURI !== NAMESPACE.HTML) return false;
        var localname = elt.localName;
        if (localname === tag) return true;
        if (localname !== "optgroup" && localname !== "option")
          return false;
      }
      return false;
    };
    HTMLParser.ElementStack.prototype.generateImpliedEndTags = function(butnot, thorough) {
      var endTagSet = thorough ? thoroughImpliedEndTagsSet : impliedEndTagsSet;
      for (var i = this.elements.length - 1; i >= 0; i--) {
        var e = this.elements[i];
        if (butnot && isA(e, butnot)) break;
        if (!isA(this.elements[i], endTagSet)) break;
      }
      this.elements.length = i + 1;
      this.top = this.elements[i];
    };
    HTMLParser.ActiveFormattingElements = function AFE() {
      this.list = [];
      this.attrs = [];
    };
    HTMLParser.ActiveFormattingElements.prototype.MARKER = { localName: "|" };
    HTMLParser.ActiveFormattingElements.prototype.insertMarker = function() {
      this.list.push(this.MARKER);
      this.attrs.push(this.MARKER);
    };
    HTMLParser.ActiveFormattingElements.prototype.push = function(elt, attrs) {
      var count = 0;
      for (var i = this.list.length - 1; i >= 0; i--) {
        if (this.list[i] === this.MARKER) break;
        if (equal(elt, this.list[i], this.attrs[i])) {
          count++;
          if (count === 3) {
            this.list.splice(i, 1);
            this.attrs.splice(i, 1);
            break;
          }
        }
      }
      this.list.push(elt);
      var attrcopy = [];
      for (var ii = 0; ii < attrs.length; ii++) {
        attrcopy[ii] = attrs[ii];
      }
      this.attrs.push(attrcopy);
      function equal(newelt, oldelt, oldattrs) {
        if (newelt.localName !== oldelt.localName) return false;
        if (newelt._numattrs !== oldattrs.length) return false;
        for (var i2 = 0, n = oldattrs.length; i2 < n; i2++) {
          var oldname = oldattrs[i2][0];
          var oldval = oldattrs[i2][1];
          if (!newelt.hasAttribute(oldname)) return false;
          if (newelt.getAttribute(oldname) !== oldval) return false;
        }
        return true;
      }
    };
    HTMLParser.ActiveFormattingElements.prototype.clearToMarker = function() {
      for (var i = this.list.length - 1; i >= 0; i--) {
        if (this.list[i] === this.MARKER) break;
      }
      if (i < 0) i = 0;
      this.list.length = i;
      this.attrs.length = i;
    };
    HTMLParser.ActiveFormattingElements.prototype.findElementByTag = function(tag) {
      for (var i = this.list.length - 1; i >= 0; i--) {
        var elt = this.list[i];
        if (elt === this.MARKER) break;
        if (elt.localName === tag) return elt;
      }
      return null;
    };
    HTMLParser.ActiveFormattingElements.prototype.indexOf = function(e) {
      return this.list.lastIndexOf(e);
    };
    HTMLParser.ActiveFormattingElements.prototype.remove = function(e) {
      var idx = this.list.lastIndexOf(e);
      if (idx !== -1) {
        this.list.splice(idx, 1);
        this.attrs.splice(idx, 1);
      }
    };
    HTMLParser.ActiveFormattingElements.prototype.replace = function(a, b, attrs) {
      var idx = this.list.lastIndexOf(a);
      if (idx !== -1) {
        this.list[idx] = b;
        this.attrs[idx] = attrs;
      }
    };
    HTMLParser.ActiveFormattingElements.prototype.insertAfter = function(a, b) {
      var idx = this.list.lastIndexOf(a);
      if (idx !== -1) {
        this.list.splice(idx, 0, b);
        this.attrs.splice(idx, 0, b);
      }
    };
    function HTMLParser(address, fragmentContext, options) {
      var chars = null;
      var numchars = 0;
      var nextchar = 0;
      var input_complete = false;
      var scanner_skip_newline = false;
      var reentrant_invocations = 0;
      var saved_scanner_state = [];
      var leftovers = "";
      var first_batch = true;
      var paused = 0;
      var tokenizer = data_state;
      var return_state;
      var character_reference_code;
      var tagnamebuf = "";
      var lasttagname = "";
      var tempbuf = [];
      var attrnamebuf = "";
      var attrvaluebuf = "";
      var commentbuf = [];
      var doctypenamebuf = [];
      var doctypepublicbuf = [];
      var doctypesystembuf = [];
      var attributes = [];
      var is_end_tag = false;
      var parser = initial_mode;
      var originalInsertionMode = null;
      var templateInsertionModes = [];
      var stack = new HTMLParser.ElementStack();
      var afe = new HTMLParser.ActiveFormattingElements();
      var fragment = fragmentContext !== void 0;
      var head_element_pointer = null;
      var form_element_pointer = null;
      var scripting_enabled = true;
      if (fragmentContext) {
        scripting_enabled = fragmentContext.ownerDocument._scripting_enabled;
      }
      if (options && options.scripting_enabled === false)
        scripting_enabled = false;
      var frameset_ok = true;
      var force_quirks = false;
      var pending_table_text;
      var text_integration_mode;
      var textrun = [];
      var textIncludesNUL = false;
      var ignore_linefeed = false;
      var htmlparser = {
        document: function() {
          return doc;
        },
        // Convenience function for internal use. Can only be called once,
        // as it removes the nodes from `doc` to add them to fragment.
        _asDocumentFragment: function() {
          var frag = doc.createDocumentFragment();
          var root2 = doc.firstChild;
          while (root2.hasChildNodes()) {
            frag.appendChild(root2.firstChild);
          }
          return frag;
        },
        // Internal function used from HTMLScriptElement to pause the
        // parser while a script is being loaded from the network
        pause: function() {
          paused++;
        },
        // Called when a script finishes loading
        resume: function() {
          paused--;
          this.parse("");
        },
        // Parse the HTML text s.
        // The second argument should be true if there is no more
        // text to be parsed, and should be false or omitted otherwise.
        // The second argument must not be set for recursive invocations
        // from document.write()
        parse: function(s, end, shouldPauseFunc) {
          var moreToDo;
          if (paused > 0) {
            leftovers += s;
            return true;
          }
          if (reentrant_invocations === 0) {
            if (leftovers) {
              s = leftovers + s;
              leftovers = "";
            }
            if (end) {
              s += "\uFFFF";
              input_complete = true;
            }
            chars = s;
            numchars = s.length;
            nextchar = 0;
            if (first_batch) {
              first_batch = false;
              if (chars.charCodeAt(0) === 65279) nextchar = 1;
            }
            reentrant_invocations++;
            moreToDo = scanChars(shouldPauseFunc);
            leftovers = chars.substring(nextchar, numchars);
            reentrant_invocations--;
          } else {
            reentrant_invocations++;
            saved_scanner_state.push(chars, numchars, nextchar);
            chars = s;
            numchars = s.length;
            nextchar = 0;
            scanChars();
            moreToDo = false;
            leftovers = chars.substring(nextchar, numchars);
            nextchar = saved_scanner_state.pop();
            numchars = saved_scanner_state.pop();
            chars = saved_scanner_state.pop();
            if (leftovers) {
              chars = leftovers + chars.substring(nextchar);
              numchars = chars.length;
              nextchar = 0;
              leftovers = "";
            }
            reentrant_invocations--;
          }
          return moreToDo;
        }
      };
      var doc = new Document(true, address);
      doc._parser = htmlparser;
      doc._scripting_enabled = scripting_enabled;
      if (fragmentContext) {
        if (fragmentContext.ownerDocument._quirks)
          doc._quirks = true;
        if (fragmentContext.ownerDocument._limitedQuirks)
          doc._limitedQuirks = true;
        if (fragmentContext.namespaceURI === NAMESPACE.HTML) {
          switch (fragmentContext.localName) {
            case "title":
            case "textarea":
              tokenizer = rcdata_state;
              break;
            case "style":
            case "xmp":
            case "iframe":
            case "noembed":
            case "noframes":
            case "script":
            case "plaintext":
              tokenizer = plaintext_state;
              break;
          }
        }
        var root = doc.createElement("html");
        doc._appendChild(root);
        stack.push(root);
        if (fragmentContext instanceof impl.HTMLTemplateElement) {
          templateInsertionModes.push(in_template_mode);
        }
        resetInsertionMode();
        for (var e = fragmentContext; e !== null; e = e.parentElement) {
          if (e instanceof impl.HTMLFormElement) {
            form_element_pointer = e;
            break;
          }
        }
      }
      function scanChars(shouldPauseFunc) {
        var codepoint, s, pattern, eof;
        while (nextchar < numchars) {
          if (paused > 0 || shouldPauseFunc && shouldPauseFunc()) {
            return true;
          }
          switch (typeof tokenizer.lookahead) {
            case "undefined":
              codepoint = chars.charCodeAt(nextchar++);
              if (scanner_skip_newline) {
                scanner_skip_newline = false;
                if (codepoint === 10) {
                  nextchar++;
                  continue;
                }
              }
              switch (codepoint) {
                case 13:
                  if (nextchar < numchars) {
                    if (chars.charCodeAt(nextchar) === 10)
                      nextchar++;
                  } else {
                    scanner_skip_newline = true;
                  }
                  tokenizer(10);
                  break;
                case 65535:
                  if (input_complete && nextchar === numchars) {
                    tokenizer(EOF);
                    break;
                  }
                /* falls through */
                default:
                  tokenizer(codepoint);
                  break;
              }
              break;
            case "number":
              codepoint = chars.charCodeAt(nextchar);
              var n = tokenizer.lookahead;
              var needsString = true;
              if (n < 0) {
                needsString = false;
                n = -n;
              }
              if (n < numchars - nextchar) {
                s = needsString ? chars.substring(nextchar, nextchar + n) : null;
                eof = false;
              } else {
                if (input_complete) {
                  s = needsString ? chars.substring(nextchar, numchars) : null;
                  eof = true;
                  if (codepoint === 65535 && nextchar === numchars - 1)
                    codepoint = EOF;
                } else {
                  return true;
                }
              }
              tokenizer(codepoint, s, eof);
              break;
            case "string":
              codepoint = chars.charCodeAt(nextchar);
              pattern = tokenizer.lookahead;
              var pos = chars.indexOf(pattern, nextchar);
              if (pos !== -1) {
                s = chars.substring(nextchar, pos + pattern.length);
                eof = false;
              } else {
                if (!input_complete) return true;
                s = chars.substring(nextchar, numchars);
                if (codepoint === 65535 && nextchar === numchars - 1)
                  codepoint = EOF;
                eof = true;
              }
              tokenizer(codepoint, s, eof);
              break;
          }
        }
        return false;
      }
      function addAttribute(name, value) {
        for (var i = 0; i < attributes.length; i++) {
          if (attributes[i][0] === name) return;
        }
        if (value !== void 0) {
          attributes.push([name, value]);
        } else {
          attributes.push([name]);
        }
      }
      function handleSimpleAttribute() {
        SIMPLEATTR.lastIndex = nextchar - 1;
        var matched = SIMPLEATTR.exec(chars);
        if (!matched) throw new Error("should never happen");
        var name = matched[1];
        if (!name) return false;
        var value = matched[2];
        var len = value.length;
        switch (value[0]) {
          case '"':
          case "'":
            value = value.substring(1, len - 1);
            nextchar += matched[0].length - 1;
            tokenizer = after_attribute_value_quoted_state;
            break;
          default:
            tokenizer = before_attribute_name_state;
            nextchar += matched[0].length - 1;
            value = value.substring(0, len - 1);
            break;
        }
        for (var i = 0; i < attributes.length; i++) {
          if (attributes[i][0] === name) return true;
        }
        attributes.push([name, value]);
        return true;
      }
      function beginTagName() {
        is_end_tag = false;
        tagnamebuf = "";
        attributes.length = 0;
      }
      function beginEndTagName() {
        is_end_tag = true;
        tagnamebuf = "";
        attributes.length = 0;
      }
      function beginTempBuf() {
        tempbuf.length = 0;
      }
      function beginAttrName() {
        attrnamebuf = "";
      }
      function beginAttrValue() {
        attrvaluebuf = "";
      }
      function beginComment() {
        commentbuf.length = 0;
      }
      function beginDoctype() {
        doctypenamebuf.length = 0;
        doctypepublicbuf = null;
        doctypesystembuf = null;
      }
      function beginDoctypePublicId() {
        doctypepublicbuf = [];
      }
      function beginDoctypeSystemId() {
        doctypesystembuf = [];
      }
      function forcequirks() {
        force_quirks = true;
      }
      function cdataAllowed() {
        return stack.top && stack.top.namespaceURI !== "http://www.w3.org/1999/xhtml";
      }
      function appropriateEndTag(buf) {
        return lasttagname === buf;
      }
      function flushText() {
        if (textrun.length > 0) {
          var s = buf2str(textrun);
          textrun.length = 0;
          if (ignore_linefeed) {
            ignore_linefeed = false;
            if (s[0] === "\n") s = s.substring(1);
            if (s.length === 0) return;
          }
          insertToken(TEXT, s);
          textIncludesNUL = false;
        }
        ignore_linefeed = false;
      }
      function getMatchingChars(pattern) {
        pattern.lastIndex = nextchar - 1;
        var match = pattern.exec(chars);
        if (match && match.index === nextchar - 1) {
          match = match[0];
          nextchar += match.length - 1;
          if (input_complete && nextchar === numchars) {
            match = match.slice(0, -1);
            nextchar--;
          }
          return match;
        } else {
          throw new Error("should never happen");
        }
      }
      function emitCharsWhile(pattern) {
        pattern.lastIndex = nextchar - 1;
        var match = pattern.exec(chars)[0];
        if (!match) return false;
        emitCharString(match);
        nextchar += match.length - 1;
        return true;
      }
      function emitCharString(s) {
        if (textrun.length > 0) flushText();
        if (ignore_linefeed) {
          ignore_linefeed = false;
          if (s[0] === "\n") s = s.substring(1);
          if (s.length === 0) return;
        }
        insertToken(TEXT, s);
      }
      function emitTag() {
        if (is_end_tag) insertToken(ENDTAG, tagnamebuf);
        else {
          var tagname = tagnamebuf;
          tagnamebuf = "";
          lasttagname = tagname;
          insertToken(TAG, tagname, attributes);
        }
      }
      function emitSimpleTag() {
        if (nextchar === numchars) {
          return false;
        }
        SIMPLETAG.lastIndex = nextchar;
        var matched = SIMPLETAG.exec(chars);
        if (!matched) throw new Error("should never happen");
        var tagname = matched[2];
        if (!tagname) return false;
        var endtag = matched[1];
        if (endtag) {
          nextchar += tagname.length + 2;
          insertToken(ENDTAG, tagname);
        } else {
          nextchar += tagname.length + 1;
          lasttagname = tagname;
          insertToken(TAG, tagname, NOATTRS);
        }
        return true;
      }
      function emitSelfClosingTag() {
        if (is_end_tag) insertToken(ENDTAG, tagnamebuf, null, true);
        else {
          insertToken(TAG, tagnamebuf, attributes, true);
        }
      }
      function emitDoctype() {
        insertToken(
          DOCTYPE,
          buf2str(doctypenamebuf),
          doctypepublicbuf ? buf2str(doctypepublicbuf) : void 0,
          doctypesystembuf ? buf2str(doctypesystembuf) : void 0
        );
      }
      function emitEOF() {
        flushText();
        parser(EOF);
        doc.modclock = 1;
      }
      var insertToken = htmlparser.insertToken = function insertToken2(t, value, arg3, arg4) {
        flushText();
        var current = stack.top;
        if (!current || current.namespaceURI === NAMESPACE.HTML) {
          parser(t, value, arg3, arg4);
        } else {
          if (t !== TAG && t !== TEXT) {
            insertForeignToken(t, value, arg3, arg4);
          } else {
            if (isMathmlTextIntegrationPoint(current) && (t === TEXT || t === TAG && value !== "mglyph" && value !== "malignmark") || t === TAG && value === "svg" && current.namespaceURI === NAMESPACE.MATHML && current.localName === "annotation-xml" || isHTMLIntegrationPoint(current)) {
              text_integration_mode = true;
              parser(t, value, arg3, arg4);
              text_integration_mode = false;
            } else {
              insertForeignToken(t, value, arg3, arg4);
            }
          }
        }
      };
      function insertComment(data) {
        var parent = stack.top;
        if (foster_parent_mode && isA(parent, tablesectionrowSet)) {
          fosterParent(function(doc2) {
            return doc2.createComment(data);
          });
        } else {
          if (parent instanceof impl.HTMLTemplateElement) {
            parent = parent.content;
          }
          parent._appendChild(parent.ownerDocument.createComment(data));
        }
      }
      function insertText(s) {
        var parent = stack.top;
        if (foster_parent_mode && isA(parent, tablesectionrowSet)) {
          fosterParent(function(doc2) {
            return doc2.createTextNode(s);
          });
        } else {
          if (parent instanceof impl.HTMLTemplateElement) {
            parent = parent.content;
          }
          var lastChild = parent.lastChild;
          if (lastChild && lastChild.nodeType === Node.TEXT_NODE) {
            lastChild.appendData(s);
          } else {
            parent._appendChild(parent.ownerDocument.createTextNode(s));
          }
        }
      }
      function createHTMLElt(doc2, name, attrs) {
        var elt = html.createElement(doc2, name, null);
        if (attrs) {
          for (var i = 0, n = attrs.length; i < n; i++) {
            elt._setAttribute(attrs[i][0], attrs[i][1]);
          }
        }
        return elt;
      }
      var foster_parent_mode = false;
      function insertHTMLElement(name, attrs) {
        var elt = insertElement(function(doc2) {
          return createHTMLElt(doc2, name, attrs);
        });
        if (isA(elt, formassociatedSet)) {
          elt._form = form_element_pointer;
        }
        return elt;
      }
      function insertElement(eltFunc) {
        var elt;
        if (foster_parent_mode && isA(stack.top, tablesectionrowSet)) {
          elt = fosterParent(eltFunc);
        } else if (stack.top instanceof impl.HTMLTemplateElement) {
          elt = eltFunc(stack.top.content.ownerDocument);
          stack.top.content._appendChild(elt);
        } else {
          elt = eltFunc(stack.top.ownerDocument);
          stack.top._appendChild(elt);
        }
        stack.push(elt);
        return elt;
      }
      function insertForeignElement(name, attrs, ns) {
        return insertElement(function(doc2) {
          var elt = doc2._createElementNS(name, ns, null);
          if (attrs) {
            for (var i = 0, n = attrs.length; i < n; i++) {
              var attr = attrs[i];
              if (attr.length === 2)
                elt._setAttribute(attr[0], attr[1]);
              else {
                elt._setAttributeNS(attr[2], attr[0], attr[1]);
              }
            }
          }
          return elt;
        });
      }
      function lastElementOfType(type) {
        for (var i = stack.elements.length - 1; i >= 0; i--) {
          if (stack.elements[i] instanceof type) {
            return i;
          }
        }
        return -1;
      }
      function fosterParent(eltFunc) {
        var parent, before, lastTable = -1, lastTemplate = -1, elt;
        lastTable = lastElementOfType(impl.HTMLTableElement);
        lastTemplate = lastElementOfType(impl.HTMLTemplateElement);
        if (lastTemplate >= 0 && (lastTable < 0 || lastTemplate > lastTable)) {
          parent = stack.elements[lastTemplate];
        } else if (lastTable >= 0) {
          parent = stack.elements[lastTable].parentNode;
          if (parent) {
            before = stack.elements[lastTable];
          } else {
            parent = stack.elements[lastTable - 1];
          }
        }
        if (!parent) parent = stack.elements[0];
        if (parent instanceof impl.HTMLTemplateElement) {
          parent = parent.content;
        }
        elt = eltFunc(parent.ownerDocument);
        if (elt.nodeType === Node.TEXT_NODE) {
          var prev;
          if (before) prev = before.previousSibling;
          else prev = parent.lastChild;
          if (prev && prev.nodeType === Node.TEXT_NODE) {
            prev.appendData(elt.data);
            return elt;
          }
        }
        if (before)
          parent.insertBefore(elt, before);
        else
          parent._appendChild(elt);
        return elt;
      }
      function resetInsertionMode() {
        var last = false;
        for (var i = stack.elements.length - 1; i >= 0; i--) {
          var node = stack.elements[i];
          if (i === 0) {
            last = true;
            if (fragment) {
              node = fragmentContext;
            }
          }
          if (node.namespaceURI === NAMESPACE.HTML) {
            var tag = node.localName;
            switch (tag) {
              case "select":
                for (var j = i; j > 0; ) {
                  var ancestor = stack.elements[--j];
                  if (ancestor instanceof impl.HTMLTemplateElement) {
                    break;
                  } else if (ancestor instanceof impl.HTMLTableElement) {
                    parser = in_select_in_table_mode;
                    return;
                  }
                }
                parser = in_select_mode;
                return;
              case "tr":
                parser = in_row_mode;
                return;
              case "tbody":
              case "tfoot":
              case "thead":
                parser = in_table_body_mode;
                return;
              case "caption":
                parser = in_caption_mode;
                return;
              case "colgroup":
                parser = in_column_group_mode;
                return;
              case "table":
                parser = in_table_mode;
                return;
              case "template":
                parser = templateInsertionModes[templateInsertionModes.length - 1];
                return;
              case "body":
                parser = in_body_mode;
                return;
              case "frameset":
                parser = in_frameset_mode;
                return;
              case "html":
                if (head_element_pointer === null) {
                  parser = before_head_mode;
                } else {
                  parser = after_head_mode;
                }
                return;
              default:
                if (!last) {
                  if (tag === "head") {
                    parser = in_head_mode;
                    return;
                  }
                  if (tag === "td" || tag === "th") {
                    parser = in_cell_mode;
                    return;
                  }
                }
            }
          }
          if (last) {
            parser = in_body_mode;
            return;
          }
        }
      }
      function parseRawText(name, attrs) {
        insertHTMLElement(name, attrs);
        tokenizer = rawtext_state;
        originalInsertionMode = parser;
        parser = text_mode;
      }
      function parseRCDATA(name, attrs) {
        insertHTMLElement(name, attrs);
        tokenizer = rcdata_state;
        originalInsertionMode = parser;
        parser = text_mode;
      }
      function afeclone(doc2, i) {
        return {
          elt: createHTMLElt(doc2, afe.list[i].localName, afe.attrs[i]),
          attrs: afe.attrs[i]
        };
      }
      function afereconstruct() {
        if (afe.list.length === 0) return;
        var entry = afe.list[afe.list.length - 1];
        if (entry === afe.MARKER) return;
        if (stack.elements.lastIndexOf(entry) !== -1) return;
        for (var i = afe.list.length - 2; i >= 0; i--) {
          entry = afe.list[i];
          if (entry === afe.MARKER) break;
          if (stack.elements.lastIndexOf(entry) !== -1) break;
        }
        for (i = i + 1; i < afe.list.length; i++) {
          var newelt = insertElement(function(doc2) {
            return afeclone(doc2, i).elt;
          });
          afe.list[i] = newelt;
        }
      }
      var BOOKMARK = { localName: "BM" };
      function adoptionAgency(tag) {
        if (isA(stack.top, tag) && afe.indexOf(stack.top) === -1) {
          stack.pop();
          return true;
        }
        var outer = 0;
        while (outer < 8) {
          outer++;
          var fmtelt = afe.findElementByTag(tag);
          if (!fmtelt) {
            return false;
          }
          var index = stack.elements.lastIndexOf(fmtelt);
          if (index === -1) {
            afe.remove(fmtelt);
            return true;
          }
          if (!stack.elementInScope(fmtelt)) {
            return true;
          }
          var furthestblock = null, furthestblockindex;
          for (var i = index + 1; i < stack.elements.length; i++) {
            if (isA(stack.elements[i], specialSet)) {
              furthestblock = stack.elements[i];
              furthestblockindex = i;
              break;
            }
          }
          if (!furthestblock) {
            stack.popElement(fmtelt);
            afe.remove(fmtelt);
            return true;
          } else {
            var ancestor = stack.elements[index - 1];
            afe.insertAfter(fmtelt, BOOKMARK);
            var node = furthestblock;
            var lastnode = furthestblock;
            var nodeindex = furthestblockindex;
            var nodeafeindex;
            var inner = 0;
            while (true) {
              inner++;
              node = stack.elements[--nodeindex];
              if (node === fmtelt) break;
              nodeafeindex = afe.indexOf(node);
              if (inner > 3 && nodeafeindex !== -1) {
                afe.remove(node);
                nodeafeindex = -1;
              }
              if (nodeafeindex === -1) {
                stack.removeElement(node);
                continue;
              }
              var newelt = afeclone(ancestor.ownerDocument, nodeafeindex);
              afe.replace(node, newelt.elt, newelt.attrs);
              stack.elements[nodeindex] = newelt.elt;
              node = newelt.elt;
              if (lastnode === furthestblock) {
                afe.remove(BOOKMARK);
                afe.insertAfter(newelt.elt, BOOKMARK);
              }
              node._appendChild(lastnode);
              lastnode = node;
            }
            if (foster_parent_mode && isA(ancestor, tablesectionrowSet)) {
              fosterParent(function() {
                return lastnode;
              });
            } else if (ancestor instanceof impl.HTMLTemplateElement) {
              ancestor.content._appendChild(lastnode);
            } else {
              ancestor._appendChild(lastnode);
            }
            var newelt2 = afeclone(furthestblock.ownerDocument, afe.indexOf(fmtelt));
            while (furthestblock.hasChildNodes()) {
              newelt2.elt._appendChild(furthestblock.firstChild);
            }
            furthestblock._appendChild(newelt2.elt);
            afe.remove(fmtelt);
            afe.replace(BOOKMARK, newelt2.elt, newelt2.attrs);
            stack.removeElement(fmtelt);
            var pos = stack.elements.lastIndexOf(furthestblock);
            stack.elements.splice(pos + 1, 0, newelt2.elt);
          }
        }
        return true;
      }
      function handleScriptEnd() {
        stack.pop();
        parser = originalInsertionMode;
        return;
      }
      function stopParsing() {
        delete doc._parser;
        stack.elements.length = 0;
        if (doc.defaultView) {
          doc.defaultView.dispatchEvent(new impl.Event("load", {}));
        }
      }
      function reconsume(c, new_state) {
        tokenizer = new_state;
        nextchar--;
      }
      function data_state(c) {
        switch (c) {
          case 38:
            return_state = data_state;
            tokenizer = character_reference_state;
            break;
          case 60:
            if (emitSimpleTag())
              break;
            tokenizer = tag_open_state;
            break;
          case 0:
            textrun.push(c);
            textIncludesNUL = true;
            break;
          case -1:
            emitEOF();
            break;
          default:
            emitCharsWhile(DATATEXT) || textrun.push(c);
            break;
        }
      }
      function rcdata_state(c) {
        switch (c) {
          case 38:
            return_state = rcdata_state;
            tokenizer = character_reference_state;
            break;
          case 60:
            tokenizer = rcdata_less_than_sign_state;
            break;
          case 0:
            textrun.push(65533);
            textIncludesNUL = true;
            break;
          case -1:
            emitEOF();
            break;
          default:
            textrun.push(c);
            break;
        }
      }
      function rawtext_state(c) {
        switch (c) {
          case 60:
            tokenizer = rawtext_less_than_sign_state;
            break;
          case 0:
            textrun.push(65533);
            break;
          case -1:
            emitEOF();
            break;
          default:
            emitCharsWhile(RAWTEXT) || textrun.push(c);
            break;
        }
      }
      function script_data_state(c) {
        switch (c) {
          case 60:
            tokenizer = script_data_less_than_sign_state;
            break;
          case 0:
            textrun.push(65533);
            break;
          case -1:
            emitEOF();
            break;
          default:
            emitCharsWhile(RAWTEXT) || textrun.push(c);
            break;
        }
      }
      function plaintext_state(c) {
        switch (c) {
          case 0:
            textrun.push(65533);
            break;
          case -1:
            emitEOF();
            break;
          default:
            emitCharsWhile(PLAINTEXT) || textrun.push(c);
            break;
        }
      }
      function tag_open_state(c) {
        switch (c) {
          case 33:
            tokenizer = markup_declaration_open_state;
            break;
          case 47:
            tokenizer = end_tag_open_state;
            break;
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
          case 97:
          // [a-z]
          case 98:
          case 99:
          case 100:
          case 101:
          case 102:
          case 103:
          case 104:
          case 105:
          case 106:
          case 107:
          case 108:
          case 109:
          case 110:
          case 111:
          case 112:
          case 113:
          case 114:
          case 115:
          case 116:
          case 117:
          case 118:
          case 119:
          case 120:
          case 121:
          case 122:
            beginTagName();
            reconsume(c, tag_name_state);
            break;
          case 63:
            reconsume(c, bogus_comment_state);
            break;
          default:
            textrun.push(60);
            reconsume(c, data_state);
            break;
        }
      }
      function end_tag_open_state(c) {
        switch (c) {
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
          case 97:
          // [a-z]
          case 98:
          case 99:
          case 100:
          case 101:
          case 102:
          case 103:
          case 104:
          case 105:
          case 106:
          case 107:
          case 108:
          case 109:
          case 110:
          case 111:
          case 112:
          case 113:
          case 114:
          case 115:
          case 116:
          case 117:
          case 118:
          case 119:
          case 120:
          case 121:
          case 122:
            beginEndTagName();
            reconsume(c, tag_name_state);
            break;
          case 62:
            tokenizer = data_state;
            break;
          case -1:
            textrun.push(60);
            textrun.push(47);
            emitEOF();
            break;
          default:
            reconsume(c, bogus_comment_state);
            break;
        }
      }
      function tag_name_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            tokenizer = before_attribute_name_state;
            break;
          case 47:
            tokenizer = self_closing_start_tag_state;
            break;
          case 62:
            tokenizer = data_state;
            emitTag();
            break;
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
            tagnamebuf += String.fromCharCode(c + 32);
            break;
          case 0:
            tagnamebuf += String.fromCharCode(
              65533
              /* REPLACEMENT CHARACTER */
            );
            break;
          case -1:
            emitEOF();
            break;
          default:
            tagnamebuf += getMatchingChars(TAGNAME);
            break;
        }
      }
      function rcdata_less_than_sign_state(c) {
        if (c === 47) {
          beginTempBuf();
          tokenizer = rcdata_end_tag_open_state;
        } else {
          textrun.push(60);
          reconsume(c, rcdata_state);
        }
      }
      function rcdata_end_tag_open_state(c) {
        switch (c) {
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
          case 97:
          // [a-z]
          case 98:
          case 99:
          case 100:
          case 101:
          case 102:
          case 103:
          case 104:
          case 105:
          case 106:
          case 107:
          case 108:
          case 109:
          case 110:
          case 111:
          case 112:
          case 113:
          case 114:
          case 115:
          case 116:
          case 117:
          case 118:
          case 119:
          case 120:
          case 121:
          case 122:
            beginEndTagName();
            reconsume(c, rcdata_end_tag_name_state);
            break;
          default:
            textrun.push(60);
            textrun.push(47);
            reconsume(c, rcdata_state);
            break;
        }
      }
      function rcdata_end_tag_name_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            if (appropriateEndTag(tagnamebuf)) {
              tokenizer = before_attribute_name_state;
              return;
            }
            break;
          case 47:
            if (appropriateEndTag(tagnamebuf)) {
              tokenizer = self_closing_start_tag_state;
              return;
            }
            break;
          case 62:
            if (appropriateEndTag(tagnamebuf)) {
              tokenizer = data_state;
              emitTag();
              return;
            }
            break;
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
            tagnamebuf += String.fromCharCode(c + 32);
            tempbuf.push(c);
            return;
          case 97:
          // [a-z]
          case 98:
          case 99:
          case 100:
          case 101:
          case 102:
          case 103:
          case 104:
          case 105:
          case 106:
          case 107:
          case 108:
          case 109:
          case 110:
          case 111:
          case 112:
          case 113:
          case 114:
          case 115:
          case 116:
          case 117:
          case 118:
          case 119:
          case 120:
          case 121:
          case 122:
            tagnamebuf += String.fromCharCode(c);
            tempbuf.push(c);
            return;
          default:
            break;
        }
        textrun.push(60);
        textrun.push(47);
        pushAll(textrun, tempbuf);
        reconsume(c, rcdata_state);
      }
      function rawtext_less_than_sign_state(c) {
        if (c === 47) {
          beginTempBuf();
          tokenizer = rawtext_end_tag_open_state;
        } else {
          textrun.push(60);
          reconsume(c, rawtext_state);
        }
      }
      function rawtext_end_tag_open_state(c) {
        switch (c) {
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
          case 97:
          // [a-z]
          case 98:
          case 99:
          case 100:
          case 101:
          case 102:
          case 103:
          case 104:
          case 105:
          case 106:
          case 107:
          case 108:
          case 109:
          case 110:
          case 111:
          case 112:
          case 113:
          case 114:
          case 115:
          case 116:
          case 117:
          case 118:
          case 119:
          case 120:
          case 121:
          case 122:
            beginEndTagName();
            reconsume(c, rawtext_end_tag_name_state);
            break;
          default:
            textrun.push(60);
            textrun.push(47);
            reconsume(c, rawtext_state);
            break;
        }
      }
      function rawtext_end_tag_name_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            if (appropriateEndTag(tagnamebuf)) {
              tokenizer = before_attribute_name_state;
              return;
            }
            break;
          case 47:
            if (appropriateEndTag(tagnamebuf)) {
              tokenizer = self_closing_start_tag_state;
              return;
            }
            break;
          case 62:
            if (appropriateEndTag(tagnamebuf)) {
              tokenizer = data_state;
              emitTag();
              return;
            }
            break;
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
            tagnamebuf += String.fromCharCode(c + 32);
            tempbuf.push(c);
            return;
          case 97:
          // [a-z]
          case 98:
          case 99:
          case 100:
          case 101:
          case 102:
          case 103:
          case 104:
          case 105:
          case 106:
          case 107:
          case 108:
          case 109:
          case 110:
          case 111:
          case 112:
          case 113:
          case 114:
          case 115:
          case 116:
          case 117:
          case 118:
          case 119:
          case 120:
          case 121:
          case 122:
            tagnamebuf += String.fromCharCode(c);
            tempbuf.push(c);
            return;
          default:
            break;
        }
        textrun.push(60);
        textrun.push(47);
        pushAll(textrun, tempbuf);
        reconsume(c, rawtext_state);
      }
      function script_data_less_than_sign_state(c) {
        switch (c) {
          case 47:
            beginTempBuf();
            tokenizer = script_data_end_tag_open_state;
            break;
          case 33:
            tokenizer = script_data_escape_start_state;
            textrun.push(60);
            textrun.push(33);
            break;
          default:
            textrun.push(60);
            reconsume(c, script_data_state);
            break;
        }
      }
      function script_data_end_tag_open_state(c) {
        switch (c) {
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
          case 97:
          // [a-z]
          case 98:
          case 99:
          case 100:
          case 101:
          case 102:
          case 103:
          case 104:
          case 105:
          case 106:
          case 107:
          case 108:
          case 109:
          case 110:
          case 111:
          case 112:
          case 113:
          case 114:
          case 115:
          case 116:
          case 117:
          case 118:
          case 119:
          case 120:
          case 121:
          case 122:
            beginEndTagName();
            reconsume(c, script_data_end_tag_name_state);
            break;
          default:
            textrun.push(60);
            textrun.push(47);
            reconsume(c, script_data_state);
            break;
        }
      }
      function script_data_end_tag_name_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            if (appropriateEndTag(tagnamebuf)) {
              tokenizer = before_attribute_name_state;
              return;
            }
            break;
          case 47:
            if (appropriateEndTag(tagnamebuf)) {
              tokenizer = self_closing_start_tag_state;
              return;
            }
            break;
          case 62:
            if (appropriateEndTag(tagnamebuf)) {
              tokenizer = data_state;
              emitTag();
              return;
            }
            break;
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
            tagnamebuf += String.fromCharCode(c + 32);
            tempbuf.push(c);
            return;
          case 97:
          // [a-z]
          case 98:
          case 99:
          case 100:
          case 101:
          case 102:
          case 103:
          case 104:
          case 105:
          case 106:
          case 107:
          case 108:
          case 109:
          case 110:
          case 111:
          case 112:
          case 113:
          case 114:
          case 115:
          case 116:
          case 117:
          case 118:
          case 119:
          case 120:
          case 121:
          case 122:
            tagnamebuf += String.fromCharCode(c);
            tempbuf.push(c);
            return;
          default:
            break;
        }
        textrun.push(60);
        textrun.push(47);
        pushAll(textrun, tempbuf);
        reconsume(c, script_data_state);
      }
      function script_data_escape_start_state(c) {
        if (c === 45) {
          tokenizer = script_data_escape_start_dash_state;
          textrun.push(45);
        } else {
          reconsume(c, script_data_state);
        }
      }
      function script_data_escape_start_dash_state(c) {
        if (c === 45) {
          tokenizer = script_data_escaped_dash_dash_state;
          textrun.push(45);
        } else {
          reconsume(c, script_data_state);
        }
      }
      function script_data_escaped_state(c) {
        switch (c) {
          case 45:
            tokenizer = script_data_escaped_dash_state;
            textrun.push(45);
            break;
          case 60:
            tokenizer = script_data_escaped_less_than_sign_state;
            break;
          case 0:
            textrun.push(65533);
            break;
          case -1:
            emitEOF();
            break;
          default:
            textrun.push(c);
            break;
        }
      }
      function script_data_escaped_dash_state(c) {
        switch (c) {
          case 45:
            tokenizer = script_data_escaped_dash_dash_state;
            textrun.push(45);
            break;
          case 60:
            tokenizer = script_data_escaped_less_than_sign_state;
            break;
          case 0:
            tokenizer = script_data_escaped_state;
            textrun.push(65533);
            break;
          case -1:
            emitEOF();
            break;
          default:
            tokenizer = script_data_escaped_state;
            textrun.push(c);
            break;
        }
      }
      function script_data_escaped_dash_dash_state(c) {
        switch (c) {
          case 45:
            textrun.push(45);
            break;
          case 60:
            tokenizer = script_data_escaped_less_than_sign_state;
            break;
          case 62:
            tokenizer = script_data_state;
            textrun.push(62);
            break;
          case 0:
            tokenizer = script_data_escaped_state;
            textrun.push(65533);
            break;
          case -1:
            emitEOF();
            break;
          default:
            tokenizer = script_data_escaped_state;
            textrun.push(c);
            break;
        }
      }
      function script_data_escaped_less_than_sign_state(c) {
        switch (c) {
          case 47:
            beginTempBuf();
            tokenizer = script_data_escaped_end_tag_open_state;
            break;
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
          case 97:
          // [a-z]
          case 98:
          case 99:
          case 100:
          case 101:
          case 102:
          case 103:
          case 104:
          case 105:
          case 106:
          case 107:
          case 108:
          case 109:
          case 110:
          case 111:
          case 112:
          case 113:
          case 114:
          case 115:
          case 116:
          case 117:
          case 118:
          case 119:
          case 120:
          case 121:
          case 122:
            beginTempBuf();
            textrun.push(60);
            reconsume(c, script_data_double_escape_start_state);
            break;
          default:
            textrun.push(60);
            reconsume(c, script_data_escaped_state);
            break;
        }
      }
      function script_data_escaped_end_tag_open_state(c) {
        switch (c) {
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
          case 97:
          // [a-z]
          case 98:
          case 99:
          case 100:
          case 101:
          case 102:
          case 103:
          case 104:
          case 105:
          case 106:
          case 107:
          case 108:
          case 109:
          case 110:
          case 111:
          case 112:
          case 113:
          case 114:
          case 115:
          case 116:
          case 117:
          case 118:
          case 119:
          case 120:
          case 121:
          case 122:
            beginEndTagName();
            reconsume(c, script_data_escaped_end_tag_name_state);
            break;
          default:
            textrun.push(60);
            textrun.push(47);
            reconsume(c, script_data_escaped_state);
            break;
        }
      }
      function script_data_escaped_end_tag_name_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            if (appropriateEndTag(tagnamebuf)) {
              tokenizer = before_attribute_name_state;
              return;
            }
            break;
          case 47:
            if (appropriateEndTag(tagnamebuf)) {
              tokenizer = self_closing_start_tag_state;
              return;
            }
            break;
          case 62:
            if (appropriateEndTag(tagnamebuf)) {
              tokenizer = data_state;
              emitTag();
              return;
            }
            break;
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
            tagnamebuf += String.fromCharCode(c + 32);
            tempbuf.push(c);
            return;
          case 97:
          // [a-z]
          case 98:
          case 99:
          case 100:
          case 101:
          case 102:
          case 103:
          case 104:
          case 105:
          case 106:
          case 107:
          case 108:
          case 109:
          case 110:
          case 111:
          case 112:
          case 113:
          case 114:
          case 115:
          case 116:
          case 117:
          case 118:
          case 119:
          case 120:
          case 121:
          case 122:
            tagnamebuf += String.fromCharCode(c);
            tempbuf.push(c);
            return;
          default:
            break;
        }
        textrun.push(60);
        textrun.push(47);
        pushAll(textrun, tempbuf);
        reconsume(c, script_data_escaped_state);
      }
      function script_data_double_escape_start_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
          // SPACE
          case 47:
          // SOLIDUS
          case 62:
            if (buf2str(tempbuf) === "script") {
              tokenizer = script_data_double_escaped_state;
            } else {
              tokenizer = script_data_escaped_state;
            }
            textrun.push(c);
            break;
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
            tempbuf.push(c + 32);
            textrun.push(c);
            break;
          case 97:
          // [a-z]
          case 98:
          case 99:
          case 100:
          case 101:
          case 102:
          case 103:
          case 104:
          case 105:
          case 106:
          case 107:
          case 108:
          case 109:
          case 110:
          case 111:
          case 112:
          case 113:
          case 114:
          case 115:
          case 116:
          case 117:
          case 118:
          case 119:
          case 120:
          case 121:
          case 122:
            tempbuf.push(c);
            textrun.push(c);
            break;
          default:
            reconsume(c, script_data_escaped_state);
            break;
        }
      }
      function script_data_double_escaped_state(c) {
        switch (c) {
          case 45:
            tokenizer = script_data_double_escaped_dash_state;
            textrun.push(45);
            break;
          case 60:
            tokenizer = script_data_double_escaped_less_than_sign_state;
            textrun.push(60);
            break;
          case 0:
            textrun.push(65533);
            break;
          case -1:
            emitEOF();
            break;
          default:
            textrun.push(c);
            break;
        }
      }
      function script_data_double_escaped_dash_state(c) {
        switch (c) {
          case 45:
            tokenizer = script_data_double_escaped_dash_dash_state;
            textrun.push(45);
            break;
          case 60:
            tokenizer = script_data_double_escaped_less_than_sign_state;
            textrun.push(60);
            break;
          case 0:
            tokenizer = script_data_double_escaped_state;
            textrun.push(65533);
            break;
          case -1:
            emitEOF();
            break;
          default:
            tokenizer = script_data_double_escaped_state;
            textrun.push(c);
            break;
        }
      }
      function script_data_double_escaped_dash_dash_state(c) {
        switch (c) {
          case 45:
            textrun.push(45);
            break;
          case 60:
            tokenizer = script_data_double_escaped_less_than_sign_state;
            textrun.push(60);
            break;
          case 62:
            tokenizer = script_data_state;
            textrun.push(62);
            break;
          case 0:
            tokenizer = script_data_double_escaped_state;
            textrun.push(65533);
            break;
          case -1:
            emitEOF();
            break;
          default:
            tokenizer = script_data_double_escaped_state;
            textrun.push(c);
            break;
        }
      }
      function script_data_double_escaped_less_than_sign_state(c) {
        if (c === 47) {
          beginTempBuf();
          tokenizer = script_data_double_escape_end_state;
          textrun.push(47);
        } else {
          reconsume(c, script_data_double_escaped_state);
        }
      }
      function script_data_double_escape_end_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
          // SPACE
          case 47:
          // SOLIDUS
          case 62:
            if (buf2str(tempbuf) === "script") {
              tokenizer = script_data_escaped_state;
            } else {
              tokenizer = script_data_double_escaped_state;
            }
            textrun.push(c);
            break;
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
            tempbuf.push(c + 32);
            textrun.push(c);
            break;
          case 97:
          // [a-z]
          case 98:
          case 99:
          case 100:
          case 101:
          case 102:
          case 103:
          case 104:
          case 105:
          case 106:
          case 107:
          case 108:
          case 109:
          case 110:
          case 111:
          case 112:
          case 113:
          case 114:
          case 115:
          case 116:
          case 117:
          case 118:
          case 119:
          case 120:
          case 121:
          case 122:
            tempbuf.push(c);
            textrun.push(c);
            break;
          default:
            reconsume(c, script_data_double_escaped_state);
            break;
        }
      }
      function before_attribute_name_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            break;
          // For SOLIDUS, GREATER-THAN SIGN, and EOF, spec says "reconsume in
          // the after attribute name state", but in our implementation that
          // state always has an active attribute in attrnamebuf.  Just clone
          // the rules here, without the addAttribute business.
          case 47:
            tokenizer = self_closing_start_tag_state;
            break;
          case 62:
            tokenizer = data_state;
            emitTag();
            break;
          case -1:
            emitEOF();
            break;
          case 61:
            beginAttrName();
            attrnamebuf += String.fromCharCode(c);
            tokenizer = attribute_name_state;
            break;
          default:
            if (handleSimpleAttribute()) break;
            beginAttrName();
            reconsume(c, attribute_name_state);
            break;
        }
      }
      function attribute_name_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
          // SPACE
          case 47:
          // SOLIDUS
          case 62:
          // GREATER-THAN SIGN
          case -1:
            reconsume(c, after_attribute_name_state);
            break;
          case 61:
            tokenizer = before_attribute_value_state;
            break;
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
            attrnamebuf += String.fromCharCode(c + 32);
            break;
          case 0:
            attrnamebuf += String.fromCharCode(
              65533
              /* REPLACEMENT CHARACTER */
            );
            break;
          case 34:
          // QUOTATION MARK
          case 39:
          // APOSTROPHE
          case 60:
          // LESS-THAN SIGN
          /* falls through */
          default:
            attrnamebuf += getMatchingChars(ATTRNAME);
            break;
        }
      }
      function after_attribute_name_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            break;
          case 47:
            addAttribute(attrnamebuf);
            tokenizer = self_closing_start_tag_state;
            break;
          case 61:
            tokenizer = before_attribute_value_state;
            break;
          case 62:
            tokenizer = data_state;
            addAttribute(attrnamebuf);
            emitTag();
            break;
          case -1:
            addAttribute(attrnamebuf);
            emitEOF();
            break;
          default:
            addAttribute(attrnamebuf);
            beginAttrName();
            reconsume(c, attribute_name_state);
            break;
        }
      }
      function before_attribute_value_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            break;
          case 34:
            beginAttrValue();
            tokenizer = attribute_value_double_quoted_state;
            break;
          case 39:
            beginAttrValue();
            tokenizer = attribute_value_single_quoted_state;
            break;
          case 62:
          // GREATER-THAN SIGN
          /* falls through */
          default:
            beginAttrValue();
            reconsume(c, attribute_value_unquoted_state);
            break;
        }
      }
      function attribute_value_double_quoted_state(c) {
        switch (c) {
          case 34:
            addAttribute(attrnamebuf, attrvaluebuf);
            tokenizer = after_attribute_value_quoted_state;
            break;
          case 38:
            return_state = attribute_value_double_quoted_state;
            tokenizer = character_reference_state;
            break;
          case 0:
            attrvaluebuf += String.fromCharCode(
              65533
              /* REPLACEMENT CHARACTER */
            );
            break;
          case -1:
            emitEOF();
            break;
          case 10:
            attrvaluebuf += String.fromCharCode(c);
            break;
          default:
            attrvaluebuf += getMatchingChars(DBLQUOTEATTRVAL);
            break;
        }
      }
      function attribute_value_single_quoted_state(c) {
        switch (c) {
          case 39:
            addAttribute(attrnamebuf, attrvaluebuf);
            tokenizer = after_attribute_value_quoted_state;
            break;
          case 38:
            return_state = attribute_value_single_quoted_state;
            tokenizer = character_reference_state;
            break;
          case 0:
            attrvaluebuf += String.fromCharCode(
              65533
              /* REPLACEMENT CHARACTER */
            );
            break;
          case -1:
            emitEOF();
            break;
          case 10:
            attrvaluebuf += String.fromCharCode(c);
            break;
          default:
            attrvaluebuf += getMatchingChars(SINGLEQUOTEATTRVAL);
            break;
        }
      }
      function attribute_value_unquoted_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            addAttribute(attrnamebuf, attrvaluebuf);
            tokenizer = before_attribute_name_state;
            break;
          case 38:
            return_state = attribute_value_unquoted_state;
            tokenizer = character_reference_state;
            break;
          case 62:
            addAttribute(attrnamebuf, attrvaluebuf);
            tokenizer = data_state;
            emitTag();
            break;
          case 0:
            attrvaluebuf += String.fromCharCode(
              65533
              /* REPLACEMENT CHARACTER */
            );
            break;
          case -1:
            nextchar--;
            tokenizer = data_state;
            break;
          case 34:
          // QUOTATION MARK
          case 39:
          // APOSTROPHE
          case 60:
          // LESS-THAN SIGN
          case 61:
          // EQUALS SIGN
          case 96:
          // GRAVE ACCENT
          /* falls through */
          default:
            attrvaluebuf += getMatchingChars(UNQUOTEDATTRVAL);
            break;
        }
      }
      function after_attribute_value_quoted_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            tokenizer = before_attribute_name_state;
            break;
          case 47:
            tokenizer = self_closing_start_tag_state;
            break;
          case 62:
            tokenizer = data_state;
            emitTag();
            break;
          case -1:
            emitEOF();
            break;
          default:
            reconsume(c, before_attribute_name_state);
            break;
        }
      }
      function self_closing_start_tag_state(c) {
        switch (c) {
          case 62:
            tokenizer = data_state;
            emitSelfClosingTag(true);
            break;
          case -1:
            emitEOF();
            break;
          default:
            reconsume(c, before_attribute_name_state);
            break;
        }
      }
      function bogus_comment_state(c, lookahead, eof) {
        var len = lookahead.length;
        if (eof) {
          nextchar += len - 1;
        } else {
          nextchar += len;
        }
        var comment = lookahead.substring(0, len - 1);
        comment = comment.replace(/\u0000/g, "\uFFFD");
        comment = comment.replace(/\u000D\u000A/g, "\n");
        comment = comment.replace(/\u000D/g, "\n");
        insertToken(COMMENT, comment);
        tokenizer = data_state;
      }
      bogus_comment_state.lookahead = ">";
      function markup_declaration_open_state(c, lookahead, eof) {
        if (lookahead[0] === "-" && lookahead[1] === "-") {
          nextchar += 2;
          beginComment();
          tokenizer = comment_start_state;
          return;
        }
        if (lookahead.toUpperCase() === "DOCTYPE") {
          nextchar += 7;
          tokenizer = doctype_state;
        } else if (lookahead === "[CDATA[" && cdataAllowed()) {
          nextchar += 7;
          tokenizer = cdata_section_state;
        } else {
          tokenizer = bogus_comment_state;
        }
      }
      markup_declaration_open_state.lookahead = 7;
      function comment_start_state(c) {
        beginComment();
        switch (c) {
          case 45:
            tokenizer = comment_start_dash_state;
            break;
          case 62:
            tokenizer = data_state;
            insertToken(COMMENT, buf2str(commentbuf));
            break;
          /* see comment in comment end state */
          default:
            reconsume(c, comment_state);
            break;
        }
      }
      function comment_start_dash_state(c) {
        switch (c) {
          case 45:
            tokenizer = comment_end_state;
            break;
          case 62:
            tokenizer = data_state;
            insertToken(COMMENT, buf2str(commentbuf));
            break;
          case -1:
            insertToken(COMMENT, buf2str(commentbuf));
            emitEOF();
            break;
          /* see comment in comment end state */
          default:
            commentbuf.push(
              45
              /* HYPHEN-MINUS */
            );
            reconsume(c, comment_state);
            break;
        }
      }
      function comment_state(c) {
        switch (c) {
          case 60:
            commentbuf.push(c);
            tokenizer = comment_less_than_sign_state;
            break;
          case 45:
            tokenizer = comment_end_dash_state;
            break;
          case 0:
            commentbuf.push(
              65533
              /* REPLACEMENT CHARACTER */
            );
            break;
          case -1:
            insertToken(COMMENT, buf2str(commentbuf));
            emitEOF();
            break;
          /* see comment in comment end state */
          default:
            commentbuf.push(c);
            break;
        }
      }
      function comment_less_than_sign_state(c) {
        switch (c) {
          case 33:
            commentbuf.push(c);
            tokenizer = comment_less_than_sign_bang_state;
            break;
          case 60:
            commentbuf.push(c);
            break;
          default:
            reconsume(c, comment_state);
            break;
        }
      }
      function comment_less_than_sign_bang_state(c) {
        switch (c) {
          case 45:
            tokenizer = comment_less_than_sign_bang_dash_state;
            break;
          default:
            reconsume(c, comment_state);
            break;
        }
      }
      function comment_less_than_sign_bang_dash_state(c) {
        switch (c) {
          case 45:
            tokenizer = comment_less_than_sign_bang_dash_dash_state;
            break;
          default:
            reconsume(c, comment_end_dash_state);
            break;
        }
      }
      function comment_less_than_sign_bang_dash_dash_state(c) {
        switch (c) {
          case 62:
          // GREATER-THAN SIGN
          case -1:
            reconsume(c, comment_end_state);
            break;
          default:
            reconsume(c, comment_end_state);
            break;
        }
      }
      function comment_end_dash_state(c) {
        switch (c) {
          case 45:
            tokenizer = comment_end_state;
            break;
          case -1:
            insertToken(COMMENT, buf2str(commentbuf));
            emitEOF();
            break;
          /* see comment in comment end state */
          default:
            commentbuf.push(
              45
              /* HYPHEN-MINUS */
            );
            reconsume(c, comment_state);
            break;
        }
      }
      function comment_end_state(c) {
        switch (c) {
          case 62:
            tokenizer = data_state;
            insertToken(COMMENT, buf2str(commentbuf));
            break;
          case 33:
            tokenizer = comment_end_bang_state;
            break;
          case 45:
            commentbuf.push(45);
            break;
          case -1:
            insertToken(COMMENT, buf2str(commentbuf));
            emitEOF();
            break;
          /* For security reasons: otherwise, hostile user could put a script in a comment e.g. in a blog comment and then DOS the server so that the end tag isn't read, and then the commented script tag would be treated as live code */
          default:
            commentbuf.push(45);
            commentbuf.push(45);
            reconsume(c, comment_state);
            break;
        }
      }
      function comment_end_bang_state(c) {
        switch (c) {
          case 45:
            commentbuf.push(45);
            commentbuf.push(45);
            commentbuf.push(33);
            tokenizer = comment_end_dash_state;
            break;
          case 62:
            tokenizer = data_state;
            insertToken(COMMENT, buf2str(commentbuf));
            break;
          case -1:
            insertToken(COMMENT, buf2str(commentbuf));
            emitEOF();
            break;
          /* see comment in comment end state */
          default:
            commentbuf.push(45);
            commentbuf.push(45);
            commentbuf.push(33);
            reconsume(c, comment_state);
            break;
        }
      }
      function doctype_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            tokenizer = before_doctype_name_state;
            break;
          case -1:
            beginDoctype();
            forcequirks();
            emitDoctype();
            emitEOF();
            break;
          default:
            reconsume(c, before_doctype_name_state);
            break;
        }
      }
      function before_doctype_name_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            break;
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
            beginDoctype();
            doctypenamebuf.push(c + 32);
            tokenizer = doctype_name_state;
            break;
          case 0:
            beginDoctype();
            doctypenamebuf.push(65533);
            tokenizer = doctype_name_state;
            break;
          case 62:
            beginDoctype();
            forcequirks();
            tokenizer = data_state;
            emitDoctype();
            break;
          case -1:
            beginDoctype();
            forcequirks();
            emitDoctype();
            emitEOF();
            break;
          default:
            beginDoctype();
            doctypenamebuf.push(c);
            tokenizer = doctype_name_state;
            break;
        }
      }
      function doctype_name_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            tokenizer = after_doctype_name_state;
            break;
          case 62:
            tokenizer = data_state;
            emitDoctype();
            break;
          case 65:
          // [A-Z]
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 78:
          case 79:
          case 80:
          case 81:
          case 82:
          case 83:
          case 84:
          case 85:
          case 86:
          case 87:
          case 88:
          case 89:
          case 90:
            doctypenamebuf.push(c + 32);
            break;
          case 0:
            doctypenamebuf.push(
              65533
              /* REPLACEMENT CHARACTER */
            );
            break;
          case -1:
            forcequirks();
            emitDoctype();
            emitEOF();
            break;
          default:
            doctypenamebuf.push(c);
            break;
        }
      }
      function after_doctype_name_state(c, lookahead, eof) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            nextchar += 1;
            break;
          case 62:
            tokenizer = data_state;
            nextchar += 1;
            emitDoctype();
            break;
          case -1:
            forcequirks();
            emitDoctype();
            emitEOF();
            break;
          default:
            lookahead = lookahead.toUpperCase();
            if (lookahead === "PUBLIC") {
              nextchar += 6;
              tokenizer = after_doctype_public_keyword_state;
            } else if (lookahead === "SYSTEM") {
              nextchar += 6;
              tokenizer = after_doctype_system_keyword_state;
            } else {
              forcequirks();
              tokenizer = bogus_doctype_state;
            }
            break;
        }
      }
      after_doctype_name_state.lookahead = 6;
      function after_doctype_public_keyword_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            tokenizer = before_doctype_public_identifier_state;
            break;
          case 34:
            beginDoctypePublicId();
            tokenizer = doctype_public_identifier_double_quoted_state;
            break;
          case 39:
            beginDoctypePublicId();
            tokenizer = doctype_public_identifier_single_quoted_state;
            break;
          case 62:
            forcequirks();
            tokenizer = data_state;
            emitDoctype();
            break;
          case -1:
            forcequirks();
            emitDoctype();
            emitEOF();
            break;
          default:
            forcequirks();
            tokenizer = bogus_doctype_state;
            break;
        }
      }
      function before_doctype_public_identifier_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            break;
          case 34:
            beginDoctypePublicId();
            tokenizer = doctype_public_identifier_double_quoted_state;
            break;
          case 39:
            beginDoctypePublicId();
            tokenizer = doctype_public_identifier_single_quoted_state;
            break;
          case 62:
            forcequirks();
            tokenizer = data_state;
            emitDoctype();
            break;
          case -1:
            forcequirks();
            emitDoctype();
            emitEOF();
            break;
          default:
            forcequirks();
            tokenizer = bogus_doctype_state;
            break;
        }
      }
      function doctype_public_identifier_double_quoted_state(c) {
        switch (c) {
          case 34:
            tokenizer = after_doctype_public_identifier_state;
            break;
          case 0:
            doctypepublicbuf.push(
              65533
              /* REPLACEMENT CHARACTER */
            );
            break;
          case 62:
            forcequirks();
            tokenizer = data_state;
            emitDoctype();
            break;
          case -1:
            forcequirks();
            emitDoctype();
            emitEOF();
            break;
          default:
            doctypepublicbuf.push(c);
            break;
        }
      }
      function doctype_public_identifier_single_quoted_state(c) {
        switch (c) {
          case 39:
            tokenizer = after_doctype_public_identifier_state;
            break;
          case 0:
            doctypepublicbuf.push(
              65533
              /* REPLACEMENT CHARACTER */
            );
            break;
          case 62:
            forcequirks();
            tokenizer = data_state;
            emitDoctype();
            break;
          case -1:
            forcequirks();
            emitDoctype();
            emitEOF();
            break;
          default:
            doctypepublicbuf.push(c);
            break;
        }
      }
      function after_doctype_public_identifier_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            tokenizer = between_doctype_public_and_system_identifiers_state;
            break;
          case 62:
            tokenizer = data_state;
            emitDoctype();
            break;
          case 34:
            beginDoctypeSystemId();
            tokenizer = doctype_system_identifier_double_quoted_state;
            break;
          case 39:
            beginDoctypeSystemId();
            tokenizer = doctype_system_identifier_single_quoted_state;
            break;
          case -1:
            forcequirks();
            emitDoctype();
            emitEOF();
            break;
          default:
            forcequirks();
            tokenizer = bogus_doctype_state;
            break;
        }
      }
      function between_doctype_public_and_system_identifiers_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            break;
          case 62:
            tokenizer = data_state;
            emitDoctype();
            break;
          case 34:
            beginDoctypeSystemId();
            tokenizer = doctype_system_identifier_double_quoted_state;
            break;
          case 39:
            beginDoctypeSystemId();
            tokenizer = doctype_system_identifier_single_quoted_state;
            break;
          case -1:
            forcequirks();
            emitDoctype();
            emitEOF();
            break;
          default:
            forcequirks();
            tokenizer = bogus_doctype_state;
            break;
        }
      }
      function after_doctype_system_keyword_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            tokenizer = before_doctype_system_identifier_state;
            break;
          case 34:
            beginDoctypeSystemId();
            tokenizer = doctype_system_identifier_double_quoted_state;
            break;
          case 39:
            beginDoctypeSystemId();
            tokenizer = doctype_system_identifier_single_quoted_state;
            break;
          case 62:
            forcequirks();
            tokenizer = data_state;
            emitDoctype();
            break;
          case -1:
            forcequirks();
            emitDoctype();
            emitEOF();
            break;
          default:
            forcequirks();
            tokenizer = bogus_doctype_state;
            break;
        }
      }
      function before_doctype_system_identifier_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            break;
          case 34:
            beginDoctypeSystemId();
            tokenizer = doctype_system_identifier_double_quoted_state;
            break;
          case 39:
            beginDoctypeSystemId();
            tokenizer = doctype_system_identifier_single_quoted_state;
            break;
          case 62:
            forcequirks();
            tokenizer = data_state;
            emitDoctype();
            break;
          case -1:
            forcequirks();
            emitDoctype();
            emitEOF();
            break;
          default:
            forcequirks();
            tokenizer = bogus_doctype_state;
            break;
        }
      }
      function doctype_system_identifier_double_quoted_state(c) {
        switch (c) {
          case 34:
            tokenizer = after_doctype_system_identifier_state;
            break;
          case 0:
            doctypesystembuf.push(
              65533
              /* REPLACEMENT CHARACTER */
            );
            break;
          case 62:
            forcequirks();
            tokenizer = data_state;
            emitDoctype();
            break;
          case -1:
            forcequirks();
            emitDoctype();
            emitEOF();
            break;
          default:
            doctypesystembuf.push(c);
            break;
        }
      }
      function doctype_system_identifier_single_quoted_state(c) {
        switch (c) {
          case 39:
            tokenizer = after_doctype_system_identifier_state;
            break;
          case 0:
            doctypesystembuf.push(
              65533
              /* REPLACEMENT CHARACTER */
            );
            break;
          case 62:
            forcequirks();
            tokenizer = data_state;
            emitDoctype();
            break;
          case -1:
            forcequirks();
            emitDoctype();
            emitEOF();
            break;
          default:
            doctypesystembuf.push(c);
            break;
        }
      }
      function after_doctype_system_identifier_state(c) {
        switch (c) {
          case 9:
          // CHARACTER TABULATION (tab)
          case 10:
          // LINE FEED (LF)
          case 12:
          // FORM FEED (FF)
          case 32:
            break;
          case 62:
            tokenizer = data_state;
            emitDoctype();
            break;
          case -1:
            forcequirks();
            emitDoctype();
            emitEOF();
            break;
          default:
            tokenizer = bogus_doctype_state;
            break;
        }
      }
      function bogus_doctype_state(c) {
        switch (c) {
          case 62:
            tokenizer = data_state;
            emitDoctype();
            break;
          case -1:
            emitDoctype();
            emitEOF();
            break;
          default:
            break;
        }
      }
      function cdata_section_state(c) {
        switch (c) {
          case 93:
            tokenizer = cdata_section_bracket_state;
            break;
          case -1:
            emitEOF();
            break;
          case 0:
            textIncludesNUL = true;
          /* fall through */
          default:
            emitCharsWhile(CDATATEXT) || textrun.push(c);
            break;
        }
      }
      function cdata_section_bracket_state(c) {
        switch (c) {
          case 93:
            tokenizer = cdata_section_end_state;
            break;
          default:
            textrun.push(93);
            reconsume(c, cdata_section_state);
            break;
        }
      }
      function cdata_section_end_state(c) {
        switch (c) {
          case 93:
            textrun.push(93);
            break;
          case 62:
            flushText();
            tokenizer = data_state;
            break;
          default:
            textrun.push(93);
            textrun.push(93);
            reconsume(c, cdata_section_state);
            break;
        }
      }
      function character_reference_state(c) {
        beginTempBuf();
        tempbuf.push(38);
        switch (c) {
          case 9:
          // TAB
          case 10:
          // LINE FEED
          case 12:
          // FORM FEED
          case 32:
          // SPACE
          case 60:
          // LESS-THAN SIGN
          case 38:
          // AMPERSAND
          case -1:
            reconsume(c, character_reference_end_state);
            break;
          case 35:
            tempbuf.push(c);
            tokenizer = numeric_character_reference_state;
            break;
          default:
            reconsume(c, named_character_reference_state);
            break;
        }
      }
      function named_character_reference_state(c) {
        NAMEDCHARREF.lastIndex = nextchar;
        var matched = NAMEDCHARREF.exec(chars);
        if (!matched) throw new Error("should never happen");
        var name = matched[1];
        if (!name) {
          tokenizer = character_reference_end_state;
          return;
        }
        nextchar += name.length;
        pushAll(tempbuf, str2buf(name));
        switch (return_state) {
          case attribute_value_double_quoted_state:
          case attribute_value_single_quoted_state:
          case attribute_value_unquoted_state:
            if (name[name.length - 1] !== ";") {
              if (/[=A-Za-z0-9]/.test(chars[nextchar])) {
                tokenizer = character_reference_end_state;
                return;
              }
            }
            break;
          default:
            break;
        }
        beginTempBuf();
        var rv = namedCharRefs[name];
        if (typeof rv === "number") {
          tempbuf.push(rv);
        } else {
          pushAll(tempbuf, rv);
        }
        tokenizer = character_reference_end_state;
      }
      named_character_reference_state.lookahead = -NAMEDCHARREF_MAXLEN;
      function numeric_character_reference_state(c) {
        character_reference_code = 0;
        switch (c) {
          case 120:
          // x
          case 88:
            tempbuf.push(c);
            tokenizer = hexadecimal_character_reference_start_state;
            break;
          default:
            reconsume(c, decimal_character_reference_start_state);
            break;
        }
      }
      function hexadecimal_character_reference_start_state(c) {
        switch (c) {
          case 48:
          case 49:
          case 50:
          case 51:
          case 52:
          case 53:
          case 54:
          case 55:
          case 56:
          case 57:
          // [0-9]
          case 65:
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
          // [A-F]
          case 97:
          case 98:
          case 99:
          case 100:
          case 101:
          case 102:
            reconsume(c, hexadecimal_character_reference_state);
            break;
          default:
            reconsume(c, character_reference_end_state);
            break;
        }
      }
      function decimal_character_reference_start_state(c) {
        switch (c) {
          case 48:
          case 49:
          case 50:
          case 51:
          case 52:
          case 53:
          case 54:
          case 55:
          case 56:
          case 57:
            reconsume(c, decimal_character_reference_state);
            break;
          default:
            reconsume(c, character_reference_end_state);
            break;
        }
      }
      function hexadecimal_character_reference_state(c) {
        switch (c) {
          case 65:
          case 66:
          case 67:
          case 68:
          case 69:
          case 70:
            character_reference_code *= 16;
            character_reference_code += c - 55;
            break;
          case 97:
          case 98:
          case 99:
          case 100:
          case 101:
          case 102:
            character_reference_code *= 16;
            character_reference_code += c - 87;
            break;
          case 48:
          case 49:
          case 50:
          case 51:
          case 52:
          case 53:
          case 54:
          case 55:
          case 56:
          case 57:
            character_reference_code *= 16;
            character_reference_code += c - 48;
            break;
          case 59:
            tokenizer = numeric_character_reference_end_state;
            break;
          default:
            reconsume(c, numeric_character_reference_end_state);
            break;
        }
      }
      function decimal_character_reference_state(c) {
        switch (c) {
          case 48:
          case 49:
          case 50:
          case 51:
          case 52:
          case 53:
          case 54:
          case 55:
          case 56:
          case 57:
            character_reference_code *= 10;
            character_reference_code += c - 48;
            break;
          case 59:
            tokenizer = numeric_character_reference_end_state;
            break;
          default:
            reconsume(c, numeric_character_reference_end_state);
            break;
        }
      }
      function numeric_character_reference_end_state(c) {
        if (character_reference_code in numericCharRefReplacements) {
          character_reference_code = numericCharRefReplacements[character_reference_code];
        } else if (character_reference_code > 1114111 || character_reference_code >= 55296 && character_reference_code < 57344) {
          character_reference_code = 65533;
        }
        beginTempBuf();
        if (character_reference_code <= 65535) {
          tempbuf.push(character_reference_code);
        } else {
          character_reference_code = character_reference_code - 65536;
          tempbuf.push(55296 + (character_reference_code >> 10));
          tempbuf.push(56320 + (character_reference_code & 1023));
        }
        reconsume(c, character_reference_end_state);
      }
      function character_reference_end_state(c) {
        switch (return_state) {
          case attribute_value_double_quoted_state:
          case attribute_value_single_quoted_state:
          case attribute_value_unquoted_state:
            attrvaluebuf += buf2str(tempbuf);
            break;
          default:
            pushAll(textrun, tempbuf);
            break;
        }
        reconsume(c, return_state);
      }
      function initial_mode(t, value, arg3, arg4) {
        switch (t) {
          case 1:
            value = value.replace(LEADINGWS, "");
            if (value.length === 0) return;
            break;
          // Handle anything non-space text below
          case 4:
            doc._appendChild(doc.createComment(value));
            return;
          case 5:
            var name = value;
            var publicid = arg3;
            var systemid = arg4;
            doc.appendChild(new DocumentType(doc, name, publicid, systemid));
            if (force_quirks || name.toLowerCase() !== "html" || quirkyPublicIds.test(publicid) || systemid && systemid.toLowerCase() === quirkySystemId || systemid === void 0 && conditionallyQuirkyPublicIds.test(publicid))
              doc._quirks = true;
            else if (limitedQuirkyPublicIds.test(publicid) || systemid !== void 0 && conditionallyQuirkyPublicIds.test(publicid))
              doc._limitedQuirks = true;
            parser = before_html_mode;
            return;
        }
        doc._quirks = true;
        parser = before_html_mode;
        parser(t, value, arg3, arg4);
      }
      function before_html_mode(t, value, arg3, arg4) {
        var elt;
        switch (t) {
          case 1:
            value = value.replace(LEADINGWS, "");
            if (value.length === 0) return;
            break;
          // Handle anything non-space text below
          case 5:
            return;
          case 4:
            doc._appendChild(doc.createComment(value));
            return;
          case 2:
            if (value === "html") {
              elt = createHTMLElt(doc, value, arg3);
              stack.push(elt);
              doc.appendChild(elt);
              parser = before_head_mode;
              return;
            }
            break;
          case 3:
            switch (value) {
              case "html":
              case "head":
              case "body":
              case "br":
                break;
              // fall through on these
              default:
                return;
            }
        }
        elt = createHTMLElt(doc, "html", null);
        stack.push(elt);
        doc.appendChild(elt);
        parser = before_head_mode;
        parser(t, value, arg3, arg4);
      }
      function before_head_mode(t, value, arg3, arg4) {
        switch (t) {
          case 1:
            value = value.replace(LEADINGWS, "");
            if (value.length === 0) return;
            break;
          // Handle anything non-space text below
          case 5:
            return;
          case 4:
            insertComment(value);
            return;
          case 2:
            switch (value) {
              case "html":
                in_body_mode(t, value, arg3, arg4);
                return;
              case "head":
                var elt = insertHTMLElement(value, arg3);
                head_element_pointer = elt;
                parser = in_head_mode;
                return;
            }
            break;
          case 3:
            switch (value) {
              case "html":
              case "head":
              case "body":
              case "br":
                break;
              default:
                return;
            }
        }
        before_head_mode(TAG, "head", null);
        parser(t, value, arg3, arg4);
      }
      function in_head_mode(t, value, arg3, arg4) {
        switch (t) {
          case 1:
            var ws = value.match(LEADINGWS);
            if (ws) {
              insertText(ws[0]);
              value = value.substring(ws[0].length);
            }
            if (value.length === 0) return;
            break;
          // Handle non-whitespace below
          case 4:
            insertComment(value);
            return;
          case 5:
            return;
          case 2:
            switch (value) {
              case "html":
                in_body_mode(t, value, arg3, arg4);
                return;
              case "meta":
              // XXX:
              // May need to change the encoding based on this tag
              /* falls through */
              case "base":
              case "basefont":
              case "bgsound":
              case "link":
                insertHTMLElement(value, arg3);
                stack.pop();
                return;
              case "title":
                parseRCDATA(value, arg3);
                return;
              case "noscript":
                if (!scripting_enabled) {
                  insertHTMLElement(value, arg3);
                  parser = in_head_noscript_mode;
                  return;
                }
              // Otherwise, if scripting is enabled...
              /* falls through */
              case "noframes":
              case "style":
                parseRawText(value, arg3);
                return;
              case "script":
                insertElement(function(doc2) {
                  var elt = createHTMLElt(doc2, value, arg3);
                  elt._parser_inserted = true;
                  elt._force_async = false;
                  if (fragment) elt._already_started = true;
                  flushText();
                  return elt;
                });
                tokenizer = script_data_state;
                originalInsertionMode = parser;
                parser = text_mode;
                return;
              case "template":
                insertHTMLElement(value, arg3);
                afe.insertMarker();
                frameset_ok = false;
                parser = in_template_mode;
                templateInsertionModes.push(parser);
                return;
              case "head":
                return;
            }
            break;
          case 3:
            switch (value) {
              case "head":
                stack.pop();
                parser = after_head_mode;
                return;
              case "body":
              case "html":
              case "br":
                break;
              // handle these at the bottom of the function
              case "template":
                if (!stack.contains("template")) {
                  return;
                }
                stack.generateImpliedEndTags(null, "thorough");
                stack.popTag("template");
                afe.clearToMarker();
                templateInsertionModes.pop();
                resetInsertionMode();
                return;
              default:
                return;
            }
            break;
        }
        in_head_mode(ENDTAG, "head", null);
        parser(t, value, arg3, arg4);
      }
      function in_head_noscript_mode(t, value, arg3, arg4) {
        switch (t) {
          case 5:
            return;
          case 4:
            in_head_mode(t, value);
            return;
          case 1:
            var ws = value.match(LEADINGWS);
            if (ws) {
              in_head_mode(t, ws[0]);
              value = value.substring(ws[0].length);
            }
            if (value.length === 0) return;
            break;
          // Handle non-whitespace below
          case 2:
            switch (value) {
              case "html":
                in_body_mode(t, value, arg3, arg4);
                return;
              case "basefont":
              case "bgsound":
              case "link":
              case "meta":
              case "noframes":
              case "style":
                in_head_mode(t, value, arg3);
                return;
              case "head":
              case "noscript":
                return;
            }
            break;
          case 3:
            switch (value) {
              case "noscript":
                stack.pop();
                parser = in_head_mode;
                return;
              case "br":
                break;
              // goes to the outer default
              default:
                return;
            }
            break;
        }
        in_head_noscript_mode(ENDTAG, "noscript", null);
        parser(t, value, arg3, arg4);
      }
      function after_head_mode(t, value, arg3, arg4) {
        switch (t) {
          case 1:
            var ws = value.match(LEADINGWS);
            if (ws) {
              insertText(ws[0]);
              value = value.substring(ws[0].length);
            }
            if (value.length === 0) return;
            break;
          // Handle non-whitespace below
          case 4:
            insertComment(value);
            return;
          case 5:
            return;
          case 2:
            switch (value) {
              case "html":
                in_body_mode(t, value, arg3, arg4);
                return;
              case "body":
                insertHTMLElement(value, arg3);
                frameset_ok = false;
                parser = in_body_mode;
                return;
              case "frameset":
                insertHTMLElement(value, arg3);
                parser = in_frameset_mode;
                return;
              case "base":
              case "basefont":
              case "bgsound":
              case "link":
              case "meta":
              case "noframes":
              case "script":
              case "style":
              case "template":
              case "title":
                stack.push(head_element_pointer);
                in_head_mode(TAG, value, arg3);
                stack.removeElement(head_element_pointer);
                return;
              case "head":
                return;
            }
            break;
          case 3:
            switch (value) {
              case "template":
                return in_head_mode(t, value, arg3, arg4);
              case "body":
              case "html":
              case "br":
                break;
              default:
                return;
            }
            break;
        }
        after_head_mode(TAG, "body", null);
        frameset_ok = true;
        parser(t, value, arg3, arg4);
      }
      function in_body_mode(t, value, arg3, arg4) {
        var body, i, node, elt;
        switch (t) {
          case 1:
            if (textIncludesNUL) {
              value = value.replace(NULCHARS, "");
              if (value.length === 0) return;
            }
            if (frameset_ok && NONWS.test(value))
              frameset_ok = false;
            afereconstruct();
            insertText(value);
            return;
          case 5:
            return;
          case 4:
            insertComment(value);
            return;
          case -1:
            if (templateInsertionModes.length) {
              return in_template_mode(t);
            }
            stopParsing();
            return;
          case 2:
            switch (value) {
              case "html":
                if (stack.contains("template")) {
                  return;
                }
                transferAttributes(arg3, stack.elements[0]);
                return;
              case "base":
              case "basefont":
              case "bgsound":
              case "link":
              case "meta":
              case "noframes":
              case "script":
              case "style":
              case "template":
              case "title":
                in_head_mode(TAG, value, arg3);
                return;
              case "body":
                body = stack.elements[1];
                if (!body || !(body instanceof impl.HTMLBodyElement) || stack.contains("template"))
                  return;
                frameset_ok = false;
                transferAttributes(arg3, body);
                return;
              case "frameset":
                if (!frameset_ok) return;
                body = stack.elements[1];
                if (!body || !(body instanceof impl.HTMLBodyElement))
                  return;
                if (body.parentNode) body.parentNode.removeChild(body);
                while (!(stack.top instanceof impl.HTMLHtmlElement))
                  stack.pop();
                insertHTMLElement(value, arg3);
                parser = in_frameset_mode;
                return;
              case "address":
              case "article":
              case "aside":
              case "blockquote":
              case "center":
              case "details":
              case "dialog":
              case "dir":
              case "div":
              case "dl":
              case "fieldset":
              case "figcaption":
              case "figure":
              case "footer":
              case "header":
              case "hgroup":
              case "main":
              case "nav":
              case "ol":
              case "p":
              case "section":
              case "summary":
              case "ul":
                if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
                insertHTMLElement(value, arg3);
                return;
              case "menu":
                if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
                if (isA(stack.top, "menuitem")) {
                  stack.pop();
                }
                insertHTMLElement(value, arg3);
                return;
              case "h1":
              case "h2":
              case "h3":
              case "h4":
              case "h5":
              case "h6":
                if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
                if (stack.top instanceof impl.HTMLHeadingElement)
                  stack.pop();
                insertHTMLElement(value, arg3);
                return;
              case "pre":
              case "listing":
                if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
                insertHTMLElement(value, arg3);
                ignore_linefeed = true;
                frameset_ok = false;
                return;
              case "form":
                if (form_element_pointer && !stack.contains("template")) return;
                if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
                elt = insertHTMLElement(value, arg3);
                if (!stack.contains("template"))
                  form_element_pointer = elt;
                return;
              case "li":
                frameset_ok = false;
                for (i = stack.elements.length - 1; i >= 0; i--) {
                  node = stack.elements[i];
                  if (node instanceof impl.HTMLLIElement) {
                    in_body_mode(ENDTAG, "li");
                    break;
                  }
                  if (isA(node, specialSet) && !isA(node, addressdivpSet))
                    break;
                }
                if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
                insertHTMLElement(value, arg3);
                return;
              case "dd":
              case "dt":
                frameset_ok = false;
                for (i = stack.elements.length - 1; i >= 0; i--) {
                  node = stack.elements[i];
                  if (isA(node, dddtSet)) {
                    in_body_mode(ENDTAG, node.localName);
                    break;
                  }
                  if (isA(node, specialSet) && !isA(node, addressdivpSet))
                    break;
                }
                if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
                insertHTMLElement(value, arg3);
                return;
              case "plaintext":
                if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
                insertHTMLElement(value, arg3);
                tokenizer = plaintext_state;
                return;
              case "button":
                if (stack.inScope("button")) {
                  in_body_mode(ENDTAG, "button");
                  parser(t, value, arg3, arg4);
                } else {
                  afereconstruct();
                  insertHTMLElement(value, arg3);
                  frameset_ok = false;
                }
                return;
              case "a":
                var activeElement = afe.findElementByTag("a");
                if (activeElement) {
                  in_body_mode(ENDTAG, value);
                  afe.remove(activeElement);
                  stack.removeElement(activeElement);
                }
              /* falls through */
              case "b":
              case "big":
              case "code":
              case "em":
              case "font":
              case "i":
              case "s":
              case "small":
              case "strike":
              case "strong":
              case "tt":
              case "u":
                afereconstruct();
                afe.push(insertHTMLElement(value, arg3), arg3);
                return;
              case "nobr":
                afereconstruct();
                if (stack.inScope(value)) {
                  in_body_mode(ENDTAG, value);
                  afereconstruct();
                }
                afe.push(insertHTMLElement(value, arg3), arg3);
                return;
              case "applet":
              case "marquee":
              case "object":
                afereconstruct();
                insertHTMLElement(value, arg3);
                afe.insertMarker();
                frameset_ok = false;
                return;
              case "table":
                if (!doc._quirks && stack.inButtonScope("p")) {
                  in_body_mode(ENDTAG, "p");
                }
                insertHTMLElement(value, arg3);
                frameset_ok = false;
                parser = in_table_mode;
                return;
              case "area":
              case "br":
              case "embed":
              case "img":
              case "keygen":
              case "wbr":
                afereconstruct();
                insertHTMLElement(value, arg3);
                stack.pop();
                frameset_ok = false;
                return;
              case "input":
                afereconstruct();
                elt = insertHTMLElement(value, arg3);
                stack.pop();
                var type = elt.getAttribute("type");
                if (!type || type.toLowerCase() !== "hidden")
                  frameset_ok = false;
                return;
              case "param":
              case "source":
              case "track":
                insertHTMLElement(value, arg3);
                stack.pop();
                return;
              case "hr":
                if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
                if (isA(stack.top, "menuitem")) {
                  stack.pop();
                }
                insertHTMLElement(value, arg3);
                stack.pop();
                frameset_ok = false;
                return;
              case "image":
                in_body_mode(TAG, "img", arg3, arg4);
                return;
              case "textarea":
                insertHTMLElement(value, arg3);
                ignore_linefeed = true;
                frameset_ok = false;
                tokenizer = rcdata_state;
                originalInsertionMode = parser;
                parser = text_mode;
                return;
              case "xmp":
                if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
                afereconstruct();
                frameset_ok = false;
                parseRawText(value, arg3);
                return;
              case "iframe":
                frameset_ok = false;
                parseRawText(value, arg3);
                return;
              case "noembed":
                parseRawText(value, arg3);
                return;
              case "select":
                afereconstruct();
                insertHTMLElement(value, arg3);
                frameset_ok = false;
                if (parser === in_table_mode || parser === in_caption_mode || parser === in_table_body_mode || parser === in_row_mode || parser === in_cell_mode)
                  parser = in_select_in_table_mode;
                else
                  parser = in_select_mode;
                return;
              case "optgroup":
              case "option":
                if (stack.top instanceof impl.HTMLOptionElement) {
                  in_body_mode(ENDTAG, "option");
                }
                afereconstruct();
                insertHTMLElement(value, arg3);
                return;
              case "menuitem":
                if (isA(stack.top, "menuitem")) {
                  stack.pop();
                }
                afereconstruct();
                insertHTMLElement(value, arg3);
                return;
              case "rb":
              case "rtc":
                if (stack.inScope("ruby")) {
                  stack.generateImpliedEndTags();
                }
                insertHTMLElement(value, arg3);
                return;
              case "rp":
              case "rt":
                if (stack.inScope("ruby")) {
                  stack.generateImpliedEndTags("rtc");
                }
                insertHTMLElement(value, arg3);
                return;
              case "math":
                afereconstruct();
                adjustMathMLAttributes(arg3);
                adjustForeignAttributes(arg3);
                insertForeignElement(value, arg3, NAMESPACE.MATHML);
                if (arg4)
                  stack.pop();
                return;
              case "svg":
                afereconstruct();
                adjustSVGAttributes(arg3);
                adjustForeignAttributes(arg3);
                insertForeignElement(value, arg3, NAMESPACE.SVG);
                if (arg4)
                  stack.pop();
                return;
              case "caption":
              case "col":
              case "colgroup":
              case "frame":
              case "head":
              case "tbody":
              case "td":
              case "tfoot":
              case "th":
              case "thead":
              case "tr":
                return;
            }
            afereconstruct();
            insertHTMLElement(value, arg3);
            return;
          case 3:
            switch (value) {
              case "template":
                in_head_mode(ENDTAG, value, arg3);
                return;
              case "body":
                if (!stack.inScope("body")) return;
                parser = after_body_mode;
                return;
              case "html":
                if (!stack.inScope("body")) return;
                parser = after_body_mode;
                parser(t, value, arg3);
                return;
              case "address":
              case "article":
              case "aside":
              case "blockquote":
              case "button":
              case "center":
              case "details":
              case "dialog":
              case "dir":
              case "div":
              case "dl":
              case "fieldset":
              case "figcaption":
              case "figure":
              case "footer":
              case "header":
              case "hgroup":
              case "listing":
              case "main":
              case "menu":
              case "nav":
              case "ol":
              case "pre":
              case "section":
              case "summary":
              case "ul":
                if (!stack.inScope(value)) return;
                stack.generateImpliedEndTags();
                stack.popTag(value);
                return;
              case "form":
                if (!stack.contains("template")) {
                  var openform = form_element_pointer;
                  form_element_pointer = null;
                  if (!openform || !stack.elementInScope(openform)) return;
                  stack.generateImpliedEndTags();
                  stack.removeElement(openform);
                } else {
                  if (!stack.inScope("form")) return;
                  stack.generateImpliedEndTags();
                  stack.popTag("form");
                }
                return;
              case "p":
                if (!stack.inButtonScope(value)) {
                  in_body_mode(TAG, value, null);
                  parser(t, value, arg3, arg4);
                } else {
                  stack.generateImpliedEndTags(value);
                  stack.popTag(value);
                }
                return;
              case "li":
                if (!stack.inListItemScope(value)) return;
                stack.generateImpliedEndTags(value);
                stack.popTag(value);
                return;
              case "dd":
              case "dt":
                if (!stack.inScope(value)) return;
                stack.generateImpliedEndTags(value);
                stack.popTag(value);
                return;
              case "h1":
              case "h2":
              case "h3":
              case "h4":
              case "h5":
              case "h6":
                if (!stack.elementTypeInScope(impl.HTMLHeadingElement)) return;
                stack.generateImpliedEndTags();
                stack.popElementType(impl.HTMLHeadingElement);
                return;
              case "sarcasm":
                break;
              case "a":
              case "b":
              case "big":
              case "code":
              case "em":
              case "font":
              case "i":
              case "nobr":
              case "s":
              case "small":
              case "strike":
              case "strong":
              case "tt":
              case "u":
                var result = adoptionAgency(value);
                if (result) return;
                break;
              // Go to the "any other end tag" case
              case "applet":
              case "marquee":
              case "object":
                if (!stack.inScope(value)) return;
                stack.generateImpliedEndTags();
                stack.popTag(value);
                afe.clearToMarker();
                return;
              case "br":
                in_body_mode(TAG, value, null);
                return;
            }
            for (i = stack.elements.length - 1; i >= 0; i--) {
              node = stack.elements[i];
              if (isA(node, value)) {
                stack.generateImpliedEndTags(value);
                stack.popElement(node);
                break;
              } else if (isA(node, specialSet)) {
                return;
              }
            }
            return;
        }
      }
      function text_mode(t, value, arg3, arg4) {
        switch (t) {
          case 1:
            insertText(value);
            return;
          case -1:
            if (stack.top instanceof impl.HTMLScriptElement)
              stack.top._already_started = true;
            stack.pop();
            parser = originalInsertionMode;
            parser(t);
            return;
          case 3:
            if (value === "script") {
              handleScriptEnd();
            } else {
              stack.pop();
              parser = originalInsertionMode;
            }
            return;
          default:
            return;
        }
      }
      function in_table_mode(t, value, arg3, arg4) {
        function getTypeAttr(attrs) {
          for (var i = 0, n = attrs.length; i < n; i++) {
            if (attrs[i][0] === "type")
              return attrs[i][1].toLowerCase();
          }
          return null;
        }
        switch (t) {
          case 1:
            if (text_integration_mode) {
              in_body_mode(t, value, arg3, arg4);
              return;
            } else if (isA(stack.top, tablesectionrowSet)) {
              pending_table_text = [];
              originalInsertionMode = parser;
              parser = in_table_text_mode;
              parser(t, value, arg3, arg4);
              return;
            }
            break;
          case 4:
            insertComment(value);
            return;
          case 5:
            return;
          case 2:
            switch (value) {
              case "caption":
                stack.clearToContext(tableContextSet);
                afe.insertMarker();
                insertHTMLElement(value, arg3);
                parser = in_caption_mode;
                return;
              case "colgroup":
                stack.clearToContext(tableContextSet);
                insertHTMLElement(value, arg3);
                parser = in_column_group_mode;
                return;
              case "col":
                in_table_mode(TAG, "colgroup", null);
                parser(t, value, arg3, arg4);
                return;
              case "tbody":
              case "tfoot":
              case "thead":
                stack.clearToContext(tableContextSet);
                insertHTMLElement(value, arg3);
                parser = in_table_body_mode;
                return;
              case "td":
              case "th":
              case "tr":
                in_table_mode(TAG, "tbody", null);
                parser(t, value, arg3, arg4);
                return;
              case "table":
                if (!stack.inTableScope(value)) {
                  return;
                }
                in_table_mode(ENDTAG, value);
                parser(t, value, arg3, arg4);
                return;
              case "style":
              case "script":
              case "template":
                in_head_mode(t, value, arg3, arg4);
                return;
              case "input":
                var type = getTypeAttr(arg3);
                if (type !== "hidden") break;
                insertHTMLElement(value, arg3);
                stack.pop();
                return;
              case "form":
                if (form_element_pointer || stack.contains("template")) return;
                form_element_pointer = insertHTMLElement(value, arg3);
                stack.popElement(form_element_pointer);
                return;
            }
            break;
          case 3:
            switch (value) {
              case "table":
                if (!stack.inTableScope(value)) return;
                stack.popTag(value);
                resetInsertionMode();
                return;
              case "body":
              case "caption":
              case "col":
              case "colgroup":
              case "html":
              case "tbody":
              case "td":
              case "tfoot":
              case "th":
              case "thead":
              case "tr":
                return;
              case "template":
                in_head_mode(t, value, arg3, arg4);
                return;
            }
            break;
          case -1:
            in_body_mode(t, value, arg3, arg4);
            return;
        }
        foster_parent_mode = true;
        in_body_mode(t, value, arg3, arg4);
        foster_parent_mode = false;
      }
      function in_table_text_mode(t, value, arg3, arg4) {
        if (t === TEXT) {
          if (textIncludesNUL) {
            value = value.replace(NULCHARS, "");
            if (value.length === 0) return;
          }
          pending_table_text.push(value);
        } else {
          var s = pending_table_text.join("");
          pending_table_text.length = 0;
          if (NONWS.test(s)) {
            foster_parent_mode = true;
            in_body_mode(TEXT, s);
            foster_parent_mode = false;
          } else {
            insertText(s);
          }
          parser = originalInsertionMode;
          parser(t, value, arg3, arg4);
        }
      }
      function in_caption_mode(t, value, arg3, arg4) {
        function end_caption() {
          if (!stack.inTableScope("caption")) return false;
          stack.generateImpliedEndTags();
          stack.popTag("caption");
          afe.clearToMarker();
          parser = in_table_mode;
          return true;
        }
        switch (t) {
          case 2:
            switch (value) {
              case "caption":
              case "col":
              case "colgroup":
              case "tbody":
              case "td":
              case "tfoot":
              case "th":
              case "thead":
              case "tr":
                if (end_caption()) parser(t, value, arg3, arg4);
                return;
            }
            break;
          case 3:
            switch (value) {
              case "caption":
                end_caption();
                return;
              case "table":
                if (end_caption()) parser(t, value, arg3, arg4);
                return;
              case "body":
              case "col":
              case "colgroup":
              case "html":
              case "tbody":
              case "td":
              case "tfoot":
              case "th":
              case "thead":
              case "tr":
                return;
            }
            break;
        }
        in_body_mode(t, value, arg3, arg4);
      }
      function in_column_group_mode(t, value, arg3, arg4) {
        switch (t) {
          case 1:
            var ws = value.match(LEADINGWS);
            if (ws) {
              insertText(ws[0]);
              value = value.substring(ws[0].length);
            }
            if (value.length === 0) return;
            break;
          // Handle non-whitespace below
          case 4:
            insertComment(value);
            return;
          case 5:
            return;
          case 2:
            switch (value) {
              case "html":
                in_body_mode(t, value, arg3, arg4);
                return;
              case "col":
                insertHTMLElement(value, arg3);
                stack.pop();
                return;
              case "template":
                in_head_mode(t, value, arg3, arg4);
                return;
            }
            break;
          case 3:
            switch (value) {
              case "colgroup":
                if (!isA(stack.top, "colgroup")) {
                  return;
                }
                stack.pop();
                parser = in_table_mode;
                return;
              case "col":
                return;
              case "template":
                in_head_mode(t, value, arg3, arg4);
                return;
            }
            break;
          case -1:
            in_body_mode(t, value, arg3, arg4);
            return;
        }
        if (!isA(stack.top, "colgroup")) {
          return;
        }
        in_column_group_mode(ENDTAG, "colgroup");
        parser(t, value, arg3, arg4);
      }
      function in_table_body_mode(t, value, arg3, arg4) {
        function endsect() {
          if (!stack.inTableScope("tbody") && !stack.inTableScope("thead") && !stack.inTableScope("tfoot"))
            return;
          stack.clearToContext(tableBodyContextSet);
          in_table_body_mode(ENDTAG, stack.top.localName, null);
          parser(t, value, arg3, arg4);
        }
        switch (t) {
          case 2:
            switch (value) {
              case "tr":
                stack.clearToContext(tableBodyContextSet);
                insertHTMLElement(value, arg3);
                parser = in_row_mode;
                return;
              case "th":
              case "td":
                in_table_body_mode(TAG, "tr", null);
                parser(t, value, arg3, arg4);
                return;
              case "caption":
              case "col":
              case "colgroup":
              case "tbody":
              case "tfoot":
              case "thead":
                endsect();
                return;
            }
            break;
          case 3:
            switch (value) {
              case "table":
                endsect();
                return;
              case "tbody":
              case "tfoot":
              case "thead":
                if (stack.inTableScope(value)) {
                  stack.clearToContext(tableBodyContextSet);
                  stack.pop();
                  parser = in_table_mode;
                }
                return;
              case "body":
              case "caption":
              case "col":
              case "colgroup":
              case "html":
              case "td":
              case "th":
              case "tr":
                return;
            }
            break;
        }
        in_table_mode(t, value, arg3, arg4);
      }
      function in_row_mode(t, value, arg3, arg4) {
        function endrow() {
          if (!stack.inTableScope("tr")) return false;
          stack.clearToContext(tableRowContextSet);
          stack.pop();
          parser = in_table_body_mode;
          return true;
        }
        switch (t) {
          case 2:
            switch (value) {
              case "th":
              case "td":
                stack.clearToContext(tableRowContextSet);
                insertHTMLElement(value, arg3);
                parser = in_cell_mode;
                afe.insertMarker();
                return;
              case "caption":
              case "col":
              case "colgroup":
              case "tbody":
              case "tfoot":
              case "thead":
              case "tr":
                if (endrow()) parser(t, value, arg3, arg4);
                return;
            }
            break;
          case 3:
            switch (value) {
              case "tr":
                endrow();
                return;
              case "table":
                if (endrow()) parser(t, value, arg3, arg4);
                return;
              case "tbody":
              case "tfoot":
              case "thead":
                if (stack.inTableScope(value)) {
                  if (endrow()) parser(t, value, arg3, arg4);
                }
                return;
              case "body":
              case "caption":
              case "col":
              case "colgroup":
              case "html":
              case "td":
              case "th":
                return;
            }
            break;
        }
        in_table_mode(t, value, arg3, arg4);
      }
      function in_cell_mode(t, value, arg3, arg4) {
        switch (t) {
          case 2:
            switch (value) {
              case "caption":
              case "col":
              case "colgroup":
              case "tbody":
              case "td":
              case "tfoot":
              case "th":
              case "thead":
              case "tr":
                if (stack.inTableScope("td")) {
                  in_cell_mode(ENDTAG, "td");
                  parser(t, value, arg3, arg4);
                } else if (stack.inTableScope("th")) {
                  in_cell_mode(ENDTAG, "th");
                  parser(t, value, arg3, arg4);
                }
                return;
            }
            break;
          case 3:
            switch (value) {
              case "td":
              case "th":
                if (!stack.inTableScope(value)) return;
                stack.generateImpliedEndTags();
                stack.popTag(value);
                afe.clearToMarker();
                parser = in_row_mode;
                return;
              case "body":
              case "caption":
              case "col":
              case "colgroup":
              case "html":
                return;
              case "table":
              case "tbody":
              case "tfoot":
              case "thead":
              case "tr":
                if (!stack.inTableScope(value)) return;
                in_cell_mode(ENDTAG, stack.inTableScope("td") ? "td" : "th");
                parser(t, value, arg3, arg4);
                return;
            }
            break;
        }
        in_body_mode(t, value, arg3, arg4);
      }
      function in_select_mode(t, value, arg3, arg4) {
        switch (t) {
          case 1:
            if (textIncludesNUL) {
              value = value.replace(NULCHARS, "");
              if (value.length === 0) return;
            }
            insertText(value);
            return;
          case 4:
            insertComment(value);
            return;
          case 5:
            return;
          case -1:
            in_body_mode(t, value, arg3, arg4);
            return;
          case 2:
            switch (value) {
              case "html":
                in_body_mode(t, value, arg3, arg4);
                return;
              case "option":
                if (stack.top instanceof impl.HTMLOptionElement)
                  in_select_mode(ENDTAG, value);
                insertHTMLElement(value, arg3);
                return;
              case "optgroup":
                if (stack.top instanceof impl.HTMLOptionElement)
                  in_select_mode(ENDTAG, "option");
                if (stack.top instanceof impl.HTMLOptGroupElement)
                  in_select_mode(ENDTAG, value);
                insertHTMLElement(value, arg3);
                return;
              case "select":
                in_select_mode(ENDTAG, value);
                return;
              case "input":
              case "keygen":
              case "textarea":
                if (!stack.inSelectScope("select")) return;
                in_select_mode(ENDTAG, "select");
                parser(t, value, arg3, arg4);
                return;
              case "script":
              case "template":
                in_head_mode(t, value, arg3, arg4);
                return;
            }
            break;
          case 3:
            switch (value) {
              case "optgroup":
                if (stack.top instanceof impl.HTMLOptionElement && stack.elements[stack.elements.length - 2] instanceof impl.HTMLOptGroupElement) {
                  in_select_mode(ENDTAG, "option");
                }
                if (stack.top instanceof impl.HTMLOptGroupElement)
                  stack.pop();
                return;
              case "option":
                if (stack.top instanceof impl.HTMLOptionElement)
                  stack.pop();
                return;
              case "select":
                if (!stack.inSelectScope(value)) return;
                stack.popTag(value);
                resetInsertionMode();
                return;
              case "template":
                in_head_mode(t, value, arg3, arg4);
                return;
            }
            break;
        }
      }
      function in_select_in_table_mode(t, value, arg3, arg4) {
        switch (value) {
          case "caption":
          case "table":
          case "tbody":
          case "tfoot":
          case "thead":
          case "tr":
          case "td":
          case "th":
            switch (t) {
              case 2:
                in_select_in_table_mode(ENDTAG, "select");
                parser(t, value, arg3, arg4);
                return;
              case 3:
                if (stack.inTableScope(value)) {
                  in_select_in_table_mode(ENDTAG, "select");
                  parser(t, value, arg3, arg4);
                }
                return;
            }
        }
        in_select_mode(t, value, arg3, arg4);
      }
      function in_template_mode(t, value, arg3, arg4) {
        function switchModeAndReprocess(mode) {
          parser = mode;
          templateInsertionModes[templateInsertionModes.length - 1] = parser;
          parser(t, value, arg3, arg4);
        }
        switch (t) {
          case 1:
          // TEXT
          case 4:
          // COMMENT
          case 5:
            in_body_mode(t, value, arg3, arg4);
            return;
          case -1:
            if (!stack.contains("template")) {
              stopParsing();
            } else {
              stack.popTag("template");
              afe.clearToMarker();
              templateInsertionModes.pop();
              resetInsertionMode();
              parser(t, value, arg3, arg4);
            }
            return;
          case 2:
            switch (value) {
              case "base":
              case "basefont":
              case "bgsound":
              case "link":
              case "meta":
              case "noframes":
              case "script":
              case "style":
              case "template":
              case "title":
                in_head_mode(t, value, arg3, arg4);
                return;
              case "caption":
              case "colgroup":
              case "tbody":
              case "tfoot":
              case "thead":
                switchModeAndReprocess(in_table_mode);
                return;
              case "col":
                switchModeAndReprocess(in_column_group_mode);
                return;
              case "tr":
                switchModeAndReprocess(in_table_body_mode);
                return;
              case "td":
              case "th":
                switchModeAndReprocess(in_row_mode);
                return;
            }
            switchModeAndReprocess(in_body_mode);
            return;
          case 3:
            switch (value) {
              case "template":
                in_head_mode(t, value, arg3, arg4);
                return;
              default:
                return;
            }
        }
      }
      function after_body_mode(t, value, arg3, arg4) {
        switch (t) {
          case 1:
            if (NONWS.test(value)) break;
            in_body_mode(t, value);
            return;
          case 4:
            stack.elements[0]._appendChild(doc.createComment(value));
            return;
          case 5:
            return;
          case -1:
            stopParsing();
            return;
          case 2:
            if (value === "html") {
              in_body_mode(t, value, arg3, arg4);
              return;
            }
            break;
          // for any other tags
          case 3:
            if (value === "html") {
              if (fragment) return;
              parser = after_after_body_mode;
              return;
            }
            break;
        }
        parser = in_body_mode;
        parser(t, value, arg3, arg4);
      }
      function in_frameset_mode(t, value, arg3, arg4) {
        switch (t) {
          case 1:
            value = value.replace(ALLNONWS, "");
            if (value.length > 0) insertText(value);
            return;
          case 4:
            insertComment(value);
            return;
          case 5:
            return;
          case -1:
            stopParsing();
            return;
          case 2:
            switch (value) {
              case "html":
                in_body_mode(t, value, arg3, arg4);
                return;
              case "frameset":
                insertHTMLElement(value, arg3);
                return;
              case "frame":
                insertHTMLElement(value, arg3);
                stack.pop();
                return;
              case "noframes":
                in_head_mode(t, value, arg3, arg4);
                return;
            }
            break;
          case 3:
            if (value === "frameset") {
              if (fragment && stack.top instanceof impl.HTMLHtmlElement)
                return;
              stack.pop();
              if (!fragment && !(stack.top instanceof impl.HTMLFrameSetElement))
                parser = after_frameset_mode;
              return;
            }
            break;
        }
      }
      function after_frameset_mode(t, value, arg3, arg4) {
        switch (t) {
          case 1:
            value = value.replace(ALLNONWS, "");
            if (value.length > 0) insertText(value);
            return;
          case 4:
            insertComment(value);
            return;
          case 5:
            return;
          case -1:
            stopParsing();
            return;
          case 2:
            switch (value) {
              case "html":
                in_body_mode(t, value, arg3, arg4);
                return;
              case "noframes":
                in_head_mode(t, value, arg3, arg4);
                return;
            }
            break;
          case 3:
            if (value === "html") {
              parser = after_after_frameset_mode;
              return;
            }
            break;
        }
      }
      function after_after_body_mode(t, value, arg3, arg4) {
        switch (t) {
          case 1:
            if (NONWS.test(value)) break;
            in_body_mode(t, value, arg3, arg4);
            return;
          case 4:
            doc._appendChild(doc.createComment(value));
            return;
          case 5:
            in_body_mode(t, value, arg3, arg4);
            return;
          case -1:
            stopParsing();
            return;
          case 2:
            if (value === "html") {
              in_body_mode(t, value, arg3, arg4);
              return;
            }
            break;
        }
        parser = in_body_mode;
        parser(t, value, arg3, arg4);
      }
      function after_after_frameset_mode(t, value, arg3, arg4) {
        switch (t) {
          case 1:
            value = value.replace(ALLNONWS, "");
            if (value.length > 0)
              in_body_mode(t, value, arg3, arg4);
            return;
          case 4:
            doc._appendChild(doc.createComment(value));
            return;
          case 5:
            in_body_mode(t, value, arg3, arg4);
            return;
          case -1:
            stopParsing();
            return;
          case 2:
            switch (value) {
              case "html":
                in_body_mode(t, value, arg3, arg4);
                return;
              case "noframes":
                in_head_mode(t, value, arg3, arg4);
                return;
            }
            break;
        }
      }
      function insertForeignToken(t, value, arg3, arg4) {
        function isHTMLFont(attrs) {
          for (var i2 = 0, n = attrs.length; i2 < n; i2++) {
            switch (attrs[i2][0]) {
              case "color":
              case "face":
              case "size":
                return true;
            }
          }
          return false;
        }
        var current;
        switch (t) {
          case 1:
            if (frameset_ok && NONWSNONNUL.test(value))
              frameset_ok = false;
            if (textIncludesNUL) {
              value = value.replace(NULCHARS, "\uFFFD");
            }
            insertText(value);
            return;
          case 4:
            insertComment(value);
            return;
          case 5:
            return;
          case 2:
            switch (value) {
              case "font":
                if (!isHTMLFont(arg3)) break;
              /* falls through */
              case "b":
              case "big":
              case "blockquote":
              case "body":
              case "br":
              case "center":
              case "code":
              case "dd":
              case "div":
              case "dl":
              case "dt":
              case "em":
              case "embed":
              case "h1":
              case "h2":
              case "h3":
              case "h4":
              case "h5":
              case "h6":
              case "head":
              case "hr":
              case "i":
              case "img":
              case "li":
              case "listing":
              case "menu":
              case "meta":
              case "nobr":
              case "ol":
              case "p":
              case "pre":
              case "ruby":
              case "s":
              case "small":
              case "span":
              case "strong":
              case "strike":
              case "sub":
              case "sup":
              case "table":
              case "tt":
              case "u":
              case "ul":
              case "var":
                if (fragment) {
                  break;
                }
                do {
                  stack.pop();
                  current = stack.top;
                } while (current.namespaceURI !== NAMESPACE.HTML && !isMathmlTextIntegrationPoint(current) && !isHTMLIntegrationPoint(current));
                insertToken(t, value, arg3, arg4);
                return;
            }
            current = stack.elements.length === 1 && fragment ? fragmentContext : stack.top;
            if (current.namespaceURI === NAMESPACE.MATHML) {
              adjustMathMLAttributes(arg3);
            } else if (current.namespaceURI === NAMESPACE.SVG) {
              value = adjustSVGTagName(value);
              adjustSVGAttributes(arg3);
            }
            adjustForeignAttributes(arg3);
            insertForeignElement(value, arg3, current.namespaceURI);
            if (arg4) {
              if (value === "script" && current.namespaceURI === NAMESPACE.SVG) {
              }
              stack.pop();
            }
            return;
          case 3:
            current = stack.top;
            if (value === "script" && current.namespaceURI === NAMESPACE.SVG && current.localName === "script") {
              stack.pop();
            } else {
              var i = stack.elements.length - 1;
              var node = stack.elements[i];
              for (; ; ) {
                if (node.localName.toLowerCase() === value) {
                  stack.popElement(node);
                  break;
                }
                node = stack.elements[--i];
                if (node.namespaceURI !== NAMESPACE.HTML)
                  continue;
                parser(t, value, arg3, arg4);
                break;
              }
            }
            return;
        }
      }
      htmlparser.testTokenizer = function(input, initialState, lastStartTag, charbychar) {
        var tokens = [];
        switch (initialState) {
          case "PCDATA state":
            tokenizer = data_state;
            break;
          case "RCDATA state":
            tokenizer = rcdata_state;
            break;
          case "RAWTEXT state":
            tokenizer = rawtext_state;
            break;
          case "PLAINTEXT state":
            tokenizer = plaintext_state;
            break;
        }
        if (lastStartTag) {
          lasttagname = lastStartTag;
        }
        insertToken = function(t, value, arg3, arg4) {
          flushText();
          switch (t) {
            case 1:
              if (tokens.length > 0 && tokens[tokens.length - 1][0] === "Character") {
                tokens[tokens.length - 1][1] += value;
              } else tokens.push(["Character", value]);
              break;
            case 4:
              tokens.push(["Comment", value]);
              break;
            case 5:
              tokens.push([
                "DOCTYPE",
                value,
                arg3 === void 0 ? null : arg3,
                arg4 === void 0 ? null : arg4,
                !force_quirks
              ]);
              break;
            case 2:
              var attrs = /* @__PURE__ */ Object.create(null);
              for (var i2 = 0; i2 < arg3.length; i2++) {
                var a = arg3[i2];
                if (a.length === 1) {
                  attrs[a[0]] = "";
                } else {
                  attrs[a[0]] = a[1];
                }
              }
              var token = ["StartTag", value, attrs];
              if (arg4) token.push(true);
              tokens.push(token);
              break;
            case 3:
              tokens.push(["EndTag", value]);
              break;
            case -1:
              break;
          }
        };
        if (!charbychar) {
          this.parse(input, true);
        } else {
          for (var i = 0; i < input.length; i++) {
            this.parse(input[i]);
          }
          this.parse("", true);
        }
        return tokens;
      };
      return htmlparser;
    }
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/DOMImplementation.js
var require_DOMImplementation = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/DOMImplementation.js"(exports2, module2) {
    "use strict";
    module2.exports = DOMImplementation;
    var Document = require_Document();
    var DocumentType = require_DocumentType();
    var HTMLParser = require_HTMLParser();
    var utils = require_utils();
    var xml = require_xmlnames();
    function DOMImplementation(contextObject) {
      this.contextObject = contextObject;
    }
    var supportedFeatures = {
      "xml": { "": true, "1.0": true, "2.0": true },
      // DOM Core
      "core": { "": true, "2.0": true },
      // DOM Core
      "html": { "": true, "1.0": true, "2.0": true },
      // HTML
      "xhtml": { "": true, "1.0": true, "2.0": true }
      // HTML
    };
    DOMImplementation.prototype = {
      hasFeature: function hasFeature(feature, version) {
        var f = supportedFeatures[(feature || "").toLowerCase()];
        return f && f[version || ""] || false;
      },
      createDocumentType: function createDocumentType(qualifiedName, publicId, systemId) {
        if (!xml.isValidQName(qualifiedName)) utils.InvalidCharacterError();
        return new DocumentType(this.contextObject, qualifiedName, publicId, systemId);
      },
      createDocument: function createDocument(namespace, qualifiedName, doctype) {
        var d = new Document(false, null);
        var e;
        if (qualifiedName)
          e = d.createElementNS(namespace, qualifiedName);
        else
          e = null;
        if (doctype) {
          d.appendChild(doctype);
        }
        if (e) d.appendChild(e);
        if (namespace === utils.NAMESPACE.HTML) {
          d._contentType = "application/xhtml+xml";
        } else if (namespace === utils.NAMESPACE.SVG) {
          d._contentType = "image/svg+xml";
        } else {
          d._contentType = "application/xml";
        }
        return d;
      },
      createHTMLDocument: function createHTMLDocument(titleText) {
        var d = new Document(true, null);
        d.appendChild(new DocumentType(d, "html"));
        var html = d.createElement("html");
        d.appendChild(html);
        var head = d.createElement("head");
        html.appendChild(head);
        if (titleText !== void 0) {
          var title = d.createElement("title");
          head.appendChild(title);
          title.appendChild(d.createTextNode(titleText));
        }
        html.appendChild(d.createElement("body"));
        d.modclock = 1;
        return d;
      },
      mozSetOutputMutationHandler: function(doc, handler) {
        doc.mutationHandler = handler;
      },
      mozGetInputMutationHandler: function(doc) {
        utils.nyi();
      },
      mozHTMLParser: HTMLParser
    };
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Location.js
var require_Location = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Location.js"(exports2, module2) {
    "use strict";
    var URL2 = require_URL();
    var URLUtils = require_URLUtils();
    module2.exports = Location;
    function Location(window2, href) {
      this._window = window2;
      this._href = href;
    }
    Location.prototype = Object.create(URLUtils.prototype, {
      constructor: { value: Location },
      // Special behavior when href is set
      href: {
        get: function() {
          return this._href;
        },
        set: function(v) {
          this.assign(v);
        }
      },
      assign: { value: function(url) {
        var current = new URL2(this._href);
        var newurl = current.resolve(url);
        this._href = newurl;
      } },
      replace: { value: function(url) {
        this.assign(url);
      } },
      reload: { value: function() {
        this.assign(this.href);
      } },
      toString: { value: function() {
        return this.href;
      } }
    });
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NavigatorID.js
var require_NavigatorID = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/NavigatorID.js"(exports2, module2) {
    "use strict";
    var NavigatorID = Object.create(null, {
      appCodeName: { value: "Mozilla" },
      appName: { value: "Netscape" },
      appVersion: { value: "4.0" },
      platform: { value: "" },
      product: { value: "Gecko" },
      productSub: { value: "20100101" },
      userAgent: { value: "" },
      vendor: { value: "" },
      vendorSub: { value: "" },
      taintEnabled: { value: function() {
        return false;
      } }
    });
    module2.exports = NavigatorID;
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/WindowTimers.js
var require_WindowTimers = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/WindowTimers.js"(exports2, module2) {
    "use strict";
    var WindowTimers = {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval
    };
    module2.exports = WindowTimers;
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/impl.js
var require_impl = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/impl.js"(exports2, module2) {
    "use strict";
    var utils = require_utils();
    exports2 = module2.exports = {
      CSSStyleDeclaration: require_CSSStyleDeclaration(),
      CharacterData: require_CharacterData(),
      Comment: require_Comment(),
      DOMException: require_DOMException(),
      DOMImplementation: require_DOMImplementation(),
      DOMTokenList: require_DOMTokenList(),
      Document: require_Document(),
      DocumentFragment: require_DocumentFragment(),
      DocumentType: require_DocumentType(),
      Element: require_Element(),
      HTMLParser: require_HTMLParser(),
      NamedNodeMap: require_NamedNodeMap(),
      Node: require_Node(),
      NodeList: require_NodeList(),
      NodeFilter: require_NodeFilter(),
      ProcessingInstruction: require_ProcessingInstruction(),
      Text: require_Text(),
      Window: require_Window()
    };
    utils.merge(exports2, require_events());
    utils.merge(exports2, require_htmlelts().elements);
    utils.merge(exports2, require_svg().elements);
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Window.js
var require_Window = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/Window.js"(exports2, module2) {
    "use strict";
    var DOMImplementation = require_DOMImplementation();
    var EventTarget = require_EventTarget();
    var Location = require_Location();
    var utils = require_utils();
    module2.exports = Window;
    function Window(document) {
      this.document = document || new DOMImplementation(null).createHTMLDocument("");
      this.document._scripting_enabled = true;
      this.document.defaultView = this;
      this.location = new Location(this, this.document._address || "about:blank");
    }
    Window.prototype = Object.create(EventTarget.prototype, {
      console: { value: console },
      history: { value: {
        back: utils.nyi,
        forward: utils.nyi,
        go: utils.nyi
      } },
      navigator: { value: require_NavigatorID() },
      // Self-referential properties
      window: { get: function() {
        return this;
      } },
      self: { get: function() {
        return this;
      } },
      frames: { get: function() {
        return this;
      } },
      // Self-referential properties for a top-level window
      parent: { get: function() {
        return this;
      } },
      top: { get: function() {
        return this;
      } },
      // We don't support any other windows for now
      length: { value: 0 },
      // no frames
      frameElement: { value: null },
      // not part of a frame
      opener: { value: null },
      // not opened by another window
      // The onload event handler.
      // XXX: need to support a bunch of other event types, too,
      // and have them interoperate with document.body.
      onload: {
        get: function() {
          return this._getEventHandler("load");
        },
        set: function(v) {
          this._setEventHandler("load", v);
        }
      },
      // XXX This is a completely broken implementation
      getComputedStyle: { value: function getComputedStyle(elt) {
        return elt.style;
      } }
    });
    utils.expose(require_WindowTimers(), Window);
    utils.expose(require_impl(), Window);
  }
});

// node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/index.js
var require_lib2 = __commonJS({
  "node_modules/.pnpm/@mixmark-io+domino@2.2.0/node_modules/@mixmark-io/domino/lib/index.js"(exports2) {
    "use strict";
    var DOMImplementation = require_DOMImplementation();
    var HTMLParser = require_HTMLParser();
    var Window = require_Window();
    var impl = require_impl();
    exports2.createDOMImplementation = function() {
      return new DOMImplementation(null);
    };
    exports2.createDocument = function(html, force) {
      if (html || force) {
        var parser = new HTMLParser();
        parser.parse(html || "", true);
        return parser.document();
      }
      return new DOMImplementation(null).createHTMLDocument("");
    };
    exports2.createIncrementalHTMLParser = function() {
      var parser = new HTMLParser();
      return {
        /** Provide an additional chunk of text to be parsed. */
        write: function(s) {
          if (s.length > 0) {
            parser.parse(s, false, function() {
              return true;
            });
          }
        },
        /**
         * Signal that we are done providing input text, optionally
         * providing one last chunk as a parameter.
         */
        end: function(s) {
          parser.parse(s || "", true, function() {
            return true;
          });
        },
        /**
         * Performs a chunk of parsing work, returning at the end of
         * the next token as soon as shouldPauseFunc() returns true.
         * Returns true iff there is more work to do.
         *
         * For example:
         * ```
         *  var incrParser = domino.createIncrementalHTMLParser();
         *  incrParser.end('...long html document...');
         *  while (true) {
         *    // Pause every 10ms
         *    var start = Date.now();
         *    var pauseIn10 = function() { return (Date.now() - start) >= 10; };
         *    if (!incrParser.process(pauseIn10)) {
         *      break;
         *    }
         *    ...yield to other tasks, do other housekeeping, etc...
         *  }
         * ```
         */
        process: function(shouldPauseFunc) {
          return parser.parse("", false, shouldPauseFunc);
        },
        /**
         * Returns the result of the incremental parse.  Valid after
         * `this.end()` has been called and `this.process()` has returned
         * false.
         */
        document: function() {
          return parser.document();
        }
      };
    };
    exports2.createWindow = function(html, address) {
      var document = exports2.createDocument(html);
      if (address !== void 0) {
        document._address = address;
      }
      return new impl.Window(document);
    };
    exports2.impl = impl;
  }
});

// node_modules/.pnpm/turndown@7.2.2/node_modules/turndown/lib/turndown.cjs.js
var require_turndown_cjs = __commonJS({
  "node_modules/.pnpm/turndown@7.2.2/node_modules/turndown/lib/turndown.cjs.js"(exports2, module2) {
    "use strict";
    function extend(destination) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];
        for (var key in source) {
          if (source.hasOwnProperty(key)) destination[key] = source[key];
        }
      }
      return destination;
    }
    function repeat(character, count) {
      return Array(count + 1).join(character);
    }
    function trimLeadingNewlines(string) {
      return string.replace(/^\n*/, "");
    }
    function trimTrailingNewlines(string) {
      var indexEnd = string.length;
      while (indexEnd > 0 && string[indexEnd - 1] === "\n") indexEnd--;
      return string.substring(0, indexEnd);
    }
    function trimNewlines(string) {
      return trimTrailingNewlines(trimLeadingNewlines(string));
    }
    var blockElements = [
      "ADDRESS",
      "ARTICLE",
      "ASIDE",
      "AUDIO",
      "BLOCKQUOTE",
      "BODY",
      "CANVAS",
      "CENTER",
      "DD",
      "DIR",
      "DIV",
      "DL",
      "DT",
      "FIELDSET",
      "FIGCAPTION",
      "FIGURE",
      "FOOTER",
      "FORM",
      "FRAMESET",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "HEADER",
      "HGROUP",
      "HR",
      "HTML",
      "ISINDEX",
      "LI",
      "MAIN",
      "MENU",
      "NAV",
      "NOFRAMES",
      "NOSCRIPT",
      "OL",
      "OUTPUT",
      "P",
      "PRE",
      "SECTION",
      "TABLE",
      "TBODY",
      "TD",
      "TFOOT",
      "TH",
      "THEAD",
      "TR",
      "UL"
    ];
    function isBlock(node) {
      return is(node, blockElements);
    }
    var voidElements = [
      "AREA",
      "BASE",
      "BR",
      "COL",
      "COMMAND",
      "EMBED",
      "HR",
      "IMG",
      "INPUT",
      "KEYGEN",
      "LINK",
      "META",
      "PARAM",
      "SOURCE",
      "TRACK",
      "WBR"
    ];
    function isVoid(node) {
      return is(node, voidElements);
    }
    function hasVoid(node) {
      return has(node, voidElements);
    }
    var meaningfulWhenBlankElements = [
      "A",
      "TABLE",
      "THEAD",
      "TBODY",
      "TFOOT",
      "TH",
      "TD",
      "IFRAME",
      "SCRIPT",
      "AUDIO",
      "VIDEO"
    ];
    function isMeaningfulWhenBlank(node) {
      return is(node, meaningfulWhenBlankElements);
    }
    function hasMeaningfulWhenBlank(node) {
      return has(node, meaningfulWhenBlankElements);
    }
    function is(node, tagNames) {
      return tagNames.indexOf(node.nodeName) >= 0;
    }
    function has(node, tagNames) {
      return node.getElementsByTagName && tagNames.some(function(tagName) {
        return node.getElementsByTagName(tagName).length;
      });
    }
    var rules = {};
    rules.paragraph = {
      filter: "p",
      replacement: function(content) {
        return "\n\n" + content + "\n\n";
      }
    };
    rules.lineBreak = {
      filter: "br",
      replacement: function(content, node, options) {
        return options.br + "\n";
      }
    };
    rules.heading = {
      filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
      replacement: function(content, node, options) {
        var hLevel = Number(node.nodeName.charAt(1));
        if (options.headingStyle === "setext" && hLevel < 3) {
          var underline = repeat(hLevel === 1 ? "=" : "-", content.length);
          return "\n\n" + content + "\n" + underline + "\n\n";
        } else {
          return "\n\n" + repeat("#", hLevel) + " " + content + "\n\n";
        }
      }
    };
    rules.blockquote = {
      filter: "blockquote",
      replacement: function(content) {
        content = trimNewlines(content).replace(/^/gm, "> ");
        return "\n\n" + content + "\n\n";
      }
    };
    rules.list = {
      filter: ["ul", "ol"],
      replacement: function(content, node) {
        var parent = node.parentNode;
        if (parent.nodeName === "LI" && parent.lastElementChild === node) {
          return "\n" + content;
        } else {
          return "\n\n" + content + "\n\n";
        }
      }
    };
    rules.listItem = {
      filter: "li",
      replacement: function(content, node, options) {
        var prefix = options.bulletListMarker + "   ";
        var parent = node.parentNode;
        if (parent.nodeName === "OL") {
          var start = parent.getAttribute("start");
          var index = Array.prototype.indexOf.call(parent.children, node);
          prefix = (start ? Number(start) + index : index + 1) + ".  ";
        }
        var isParagraph = /\n$/.test(content);
        content = trimNewlines(content) + (isParagraph ? "\n" : "");
        content = content.replace(/\n/gm, "\n" + " ".repeat(prefix.length));
        return prefix + content + (node.nextSibling ? "\n" : "");
      }
    };
    rules.indentedCodeBlock = {
      filter: function(node, options) {
        return options.codeBlockStyle === "indented" && node.nodeName === "PRE" && node.firstChild && node.firstChild.nodeName === "CODE";
      },
      replacement: function(content, node, options) {
        return "\n\n    " + node.firstChild.textContent.replace(/\n/g, "\n    ") + "\n\n";
      }
    };
    rules.fencedCodeBlock = {
      filter: function(node, options) {
        return options.codeBlockStyle === "fenced" && node.nodeName === "PRE" && node.firstChild && node.firstChild.nodeName === "CODE";
      },
      replacement: function(content, node, options) {
        var className = node.firstChild.getAttribute("class") || "";
        var language = (className.match(/language-(\S+)/) || [null, ""])[1];
        var code = node.firstChild.textContent;
        var fenceChar = options.fence.charAt(0);
        var fenceSize = 3;
        var fenceInCodeRegex = new RegExp("^" + fenceChar + "{3,}", "gm");
        var match;
        while (match = fenceInCodeRegex.exec(code)) {
          if (match[0].length >= fenceSize) {
            fenceSize = match[0].length + 1;
          }
        }
        var fence = repeat(fenceChar, fenceSize);
        return "\n\n" + fence + language + "\n" + code.replace(/\n$/, "") + "\n" + fence + "\n\n";
      }
    };
    rules.horizontalRule = {
      filter: "hr",
      replacement: function(content, node, options) {
        return "\n\n" + options.hr + "\n\n";
      }
    };
    rules.inlineLink = {
      filter: function(node, options) {
        return options.linkStyle === "inlined" && node.nodeName === "A" && node.getAttribute("href");
      },
      replacement: function(content, node) {
        var href = node.getAttribute("href");
        if (href) href = href.replace(/([()])/g, "\\$1");
        var title = cleanAttribute(node.getAttribute("title"));
        if (title) title = ' "' + title.replace(/"/g, '\\"') + '"';
        return "[" + content + "](" + href + title + ")";
      }
    };
    rules.referenceLink = {
      filter: function(node, options) {
        return options.linkStyle === "referenced" && node.nodeName === "A" && node.getAttribute("href");
      },
      replacement: function(content, node, options) {
        var href = node.getAttribute("href");
        var title = cleanAttribute(node.getAttribute("title"));
        if (title) title = ' "' + title + '"';
        var replacement;
        var reference;
        switch (options.linkReferenceStyle) {
          case "collapsed":
            replacement = "[" + content + "][]";
            reference = "[" + content + "]: " + href + title;
            break;
          case "shortcut":
            replacement = "[" + content + "]";
            reference = "[" + content + "]: " + href + title;
            break;
          default:
            var id = this.references.length + 1;
            replacement = "[" + content + "][" + id + "]";
            reference = "[" + id + "]: " + href + title;
        }
        this.references.push(reference);
        return replacement;
      },
      references: [],
      append: function(options) {
        var references = "";
        if (this.references.length) {
          references = "\n\n" + this.references.join("\n") + "\n\n";
          this.references = [];
        }
        return references;
      }
    };
    rules.emphasis = {
      filter: ["em", "i"],
      replacement: function(content, node, options) {
        if (!content.trim()) return "";
        return options.emDelimiter + content + options.emDelimiter;
      }
    };
    rules.strong = {
      filter: ["strong", "b"],
      replacement: function(content, node, options) {
        if (!content.trim()) return "";
        return options.strongDelimiter + content + options.strongDelimiter;
      }
    };
    rules.code = {
      filter: function(node) {
        var hasSiblings = node.previousSibling || node.nextSibling;
        var isCodeBlock = node.parentNode.nodeName === "PRE" && !hasSiblings;
        return node.nodeName === "CODE" && !isCodeBlock;
      },
      replacement: function(content) {
        if (!content) return "";
        content = content.replace(/\r?\n|\r/g, " ");
        var extraSpace = /^`|^ .*?[^ ].* $|`$/.test(content) ? " " : "";
        var delimiter = "`";
        var matches = content.match(/`+/gm) || [];
        while (matches.indexOf(delimiter) !== -1) delimiter = delimiter + "`";
        return delimiter + extraSpace + content + extraSpace + delimiter;
      }
    };
    rules.image = {
      filter: "img",
      replacement: function(content, node) {
        var alt = cleanAttribute(node.getAttribute("alt"));
        var src = node.getAttribute("src") || "";
        var title = cleanAttribute(node.getAttribute("title"));
        var titlePart = title ? ' "' + title + '"' : "";
        return src ? "![" + alt + "](" + src + titlePart + ")" : "";
      }
    };
    function cleanAttribute(attribute) {
      return attribute ? attribute.replace(/(\n+\s*)+/g, "\n") : "";
    }
    function Rules(options) {
      this.options = options;
      this._keep = [];
      this._remove = [];
      this.blankRule = {
        replacement: options.blankReplacement
      };
      this.keepReplacement = options.keepReplacement;
      this.defaultRule = {
        replacement: options.defaultReplacement
      };
      this.array = [];
      for (var key in options.rules) this.array.push(options.rules[key]);
    }
    Rules.prototype = {
      add: function(key, rule) {
        this.array.unshift(rule);
      },
      keep: function(filter) {
        this._keep.unshift({
          filter,
          replacement: this.keepReplacement
        });
      },
      remove: function(filter) {
        this._remove.unshift({
          filter,
          replacement: function() {
            return "";
          }
        });
      },
      forNode: function(node) {
        if (node.isBlank) return this.blankRule;
        var rule;
        if (rule = findRule(this.array, node, this.options)) return rule;
        if (rule = findRule(this._keep, node, this.options)) return rule;
        if (rule = findRule(this._remove, node, this.options)) return rule;
        return this.defaultRule;
      },
      forEach: function(fn) {
        for (var i = 0; i < this.array.length; i++) fn(this.array[i], i);
      }
    };
    function findRule(rules2, node, options) {
      for (var i = 0; i < rules2.length; i++) {
        var rule = rules2[i];
        if (filterValue(rule, node, options)) return rule;
      }
      return void 0;
    }
    function filterValue(rule, node, options) {
      var filter = rule.filter;
      if (typeof filter === "string") {
        if (filter === node.nodeName.toLowerCase()) return true;
      } else if (Array.isArray(filter)) {
        if (filter.indexOf(node.nodeName.toLowerCase()) > -1) return true;
      } else if (typeof filter === "function") {
        if (filter.call(rule, node, options)) return true;
      } else {
        throw new TypeError("`filter` needs to be a string, array, or function");
      }
    }
    function collapseWhitespace(options) {
      var element = options.element;
      var isBlock2 = options.isBlock;
      var isVoid2 = options.isVoid;
      var isPre = options.isPre || function(node2) {
        return node2.nodeName === "PRE";
      };
      if (!element.firstChild || isPre(element)) return;
      var prevText = null;
      var keepLeadingWs = false;
      var prev = null;
      var node = next(prev, element, isPre);
      while (node !== element) {
        if (node.nodeType === 3 || node.nodeType === 4) {
          var text = node.data.replace(/[ \r\n\t]+/g, " ");
          if ((!prevText || / $/.test(prevText.data)) && !keepLeadingWs && text[0] === " ") {
            text = text.substr(1);
          }
          if (!text) {
            node = remove(node);
            continue;
          }
          node.data = text;
          prevText = node;
        } else if (node.nodeType === 1) {
          if (isBlock2(node) || node.nodeName === "BR") {
            if (prevText) {
              prevText.data = prevText.data.replace(/ $/, "");
            }
            prevText = null;
            keepLeadingWs = false;
          } else if (isVoid2(node) || isPre(node)) {
            prevText = null;
            keepLeadingWs = true;
          } else if (prevText) {
            keepLeadingWs = false;
          }
        } else {
          node = remove(node);
          continue;
        }
        var nextNode = next(prev, node, isPre);
        prev = node;
        node = nextNode;
      }
      if (prevText) {
        prevText.data = prevText.data.replace(/ $/, "");
        if (!prevText.data) {
          remove(prevText);
        }
      }
    }
    function remove(node) {
      var next2 = node.nextSibling || node.parentNode;
      node.parentNode.removeChild(node);
      return next2;
    }
    function next(prev, current, isPre) {
      if (prev && prev.parentNode === current || isPre(current)) {
        return current.nextSibling || current.parentNode;
      }
      return current.firstChild || current.nextSibling || current.parentNode;
    }
    var root = typeof window !== "undefined" ? window : {};
    function canParseHTMLNatively() {
      var Parser = root.DOMParser;
      var canParse = false;
      try {
        if (new Parser().parseFromString("", "text/html")) {
          canParse = true;
        }
      } catch (e) {
      }
      return canParse;
    }
    function createHTMLParser() {
      var Parser = function() {
      };
      {
        var domino = require_lib2();
        Parser.prototype.parseFromString = function(string) {
          return domino.createDocument(string);
        };
      }
      return Parser;
    }
    var HTMLParser = canParseHTMLNatively() ? root.DOMParser : createHTMLParser();
    function RootNode(input, options) {
      var root2;
      if (typeof input === "string") {
        var doc = htmlParser().parseFromString(
          // DOM parsers arrange elements in the <head> and <body>.
          // Wrapping in a custom element ensures elements are reliably arranged in
          // a single element.
          '<x-turndown id="turndown-root">' + input + "</x-turndown>",
          "text/html"
        );
        root2 = doc.getElementById("turndown-root");
      } else {
        root2 = input.cloneNode(true);
      }
      collapseWhitespace({
        element: root2,
        isBlock,
        isVoid,
        isPre: options.preformattedCode ? isPreOrCode : null
      });
      return root2;
    }
    var _htmlParser;
    function htmlParser() {
      _htmlParser = _htmlParser || new HTMLParser();
      return _htmlParser;
    }
    function isPreOrCode(node) {
      return node.nodeName === "PRE" || node.nodeName === "CODE";
    }
    function Node(node, options) {
      node.isBlock = isBlock(node);
      node.isCode = node.nodeName === "CODE" || node.parentNode.isCode;
      node.isBlank = isBlank(node);
      node.flankingWhitespace = flankingWhitespace(node, options);
      return node;
    }
    function isBlank(node) {
      return !isVoid(node) && !isMeaningfulWhenBlank(node) && /^\s*$/i.test(node.textContent) && !hasVoid(node) && !hasMeaningfulWhenBlank(node);
    }
    function flankingWhitespace(node, options) {
      if (node.isBlock || options.preformattedCode && node.isCode) {
        return { leading: "", trailing: "" };
      }
      var edges = edgeWhitespace(node.textContent);
      if (edges.leadingAscii && isFlankedByWhitespace("left", node, options)) {
        edges.leading = edges.leadingNonAscii;
      }
      if (edges.trailingAscii && isFlankedByWhitespace("right", node, options)) {
        edges.trailing = edges.trailingNonAscii;
      }
      return { leading: edges.leading, trailing: edges.trailing };
    }
    function edgeWhitespace(string) {
      var m = string.match(/^(([ \t\r\n]*)(\s*))(?:(?=\S)[\s\S]*\S)?((\s*?)([ \t\r\n]*))$/);
      return {
        leading: m[1],
        // whole string for whitespace-only strings
        leadingAscii: m[2],
        leadingNonAscii: m[3],
        trailing: m[4],
        // empty for whitespace-only strings
        trailingNonAscii: m[5],
        trailingAscii: m[6]
      };
    }
    function isFlankedByWhitespace(side, node, options) {
      var sibling;
      var regExp;
      var isFlanked;
      if (side === "left") {
        sibling = node.previousSibling;
        regExp = / $/;
      } else {
        sibling = node.nextSibling;
        regExp = /^ /;
      }
      if (sibling) {
        if (sibling.nodeType === 3) {
          isFlanked = regExp.test(sibling.nodeValue);
        } else if (options.preformattedCode && sibling.nodeName === "CODE") {
          isFlanked = false;
        } else if (sibling.nodeType === 1 && !isBlock(sibling)) {
          isFlanked = regExp.test(sibling.textContent);
        }
      }
      return isFlanked;
    }
    var reduce = Array.prototype.reduce;
    var escapes = [
      [/\\/g, "\\\\"],
      [/\*/g, "\\*"],
      [/^-/g, "\\-"],
      [/^\+ /g, "\\+ "],
      [/^(=+)/g, "\\$1"],
      [/^(#{1,6}) /g, "\\$1 "],
      [/`/g, "\\`"],
      [/^~~~/g, "\\~~~"],
      [/\[/g, "\\["],
      [/\]/g, "\\]"],
      [/^>/g, "\\>"],
      [/_/g, "\\_"],
      [/^(\d+)\. /g, "$1\\. "]
    ];
    function TurndownService(options) {
      if (!(this instanceof TurndownService)) return new TurndownService(options);
      var defaults = {
        rules,
        headingStyle: "setext",
        hr: "* * *",
        bulletListMarker: "*",
        codeBlockStyle: "indented",
        fence: "```",
        emDelimiter: "_",
        strongDelimiter: "**",
        linkStyle: "inlined",
        linkReferenceStyle: "full",
        br: "  ",
        preformattedCode: false,
        blankReplacement: function(content, node) {
          return node.isBlock ? "\n\n" : "";
        },
        keepReplacement: function(content, node) {
          return node.isBlock ? "\n\n" + node.outerHTML + "\n\n" : node.outerHTML;
        },
        defaultReplacement: function(content, node) {
          return node.isBlock ? "\n\n" + content + "\n\n" : content;
        }
      };
      this.options = extend({}, defaults, options);
      this.rules = new Rules(this.options);
    }
    TurndownService.prototype = {
      /**
       * The entry point for converting a string or DOM node to Markdown
       * @public
       * @param {String|HTMLElement} input The string or DOM node to convert
       * @returns A Markdown representation of the input
       * @type String
       */
      turndown: function(input) {
        if (!canConvert(input)) {
          throw new TypeError(
            input + " is not a string, or an element/document/fragment node."
          );
        }
        if (input === "") return "";
        var output = process2.call(this, new RootNode(input, this.options));
        return postProcess.call(this, output);
      },
      /**
       * Add one or more plugins
       * @public
       * @param {Function|Array} plugin The plugin or array of plugins to add
       * @returns The Turndown instance for chaining
       * @type Object
       */
      use: function(plugin) {
        if (Array.isArray(plugin)) {
          for (var i = 0; i < plugin.length; i++) this.use(plugin[i]);
        } else if (typeof plugin === "function") {
          plugin(this);
        } else {
          throw new TypeError("plugin must be a Function or an Array of Functions");
        }
        return this;
      },
      /**
       * Adds a rule
       * @public
       * @param {String} key The unique key of the rule
       * @param {Object} rule The rule
       * @returns The Turndown instance for chaining
       * @type Object
       */
      addRule: function(key, rule) {
        this.rules.add(key, rule);
        return this;
      },
      /**
       * Keep a node (as HTML) that matches the filter
       * @public
       * @param {String|Array|Function} filter The unique key of the rule
       * @returns The Turndown instance for chaining
       * @type Object
       */
      keep: function(filter) {
        this.rules.keep(filter);
        return this;
      },
      /**
       * Remove a node that matches the filter
       * @public
       * @param {String|Array|Function} filter The unique key of the rule
       * @returns The Turndown instance for chaining
       * @type Object
       */
      remove: function(filter) {
        this.rules.remove(filter);
        return this;
      },
      /**
       * Escapes Markdown syntax
       * @public
       * @param {String} string The string to escape
       * @returns A string with Markdown syntax escaped
       * @type String
       */
      escape: function(string) {
        return escapes.reduce(function(accumulator, escape) {
          return accumulator.replace(escape[0], escape[1]);
        }, string);
      }
    };
    function process2(parentNode) {
      var self = this;
      return reduce.call(parentNode.childNodes, function(output, node) {
        node = new Node(node, self.options);
        var replacement = "";
        if (node.nodeType === 3) {
          replacement = node.isCode ? node.nodeValue : self.escape(node.nodeValue);
        } else if (node.nodeType === 1) {
          replacement = replacementForNode.call(self, node);
        }
        return join(output, replacement);
      }, "");
    }
    function postProcess(output) {
      var self = this;
      this.rules.forEach(function(rule) {
        if (typeof rule.append === "function") {
          output = join(output, rule.append(self.options));
        }
      });
      return output.replace(/^[\t\r\n]+/, "").replace(/[\t\r\n\s]+$/, "");
    }
    function replacementForNode(node) {
      var rule = this.rules.forNode(node);
      var content = process2.call(this, node);
      var whitespace = node.flankingWhitespace;
      if (whitespace.leading || whitespace.trailing) content = content.trim();
      return whitespace.leading + rule.replacement(content, node, this.options) + whitespace.trailing;
    }
    function join(output, replacement) {
      var s1 = trimTrailingNewlines(output);
      var s2 = trimLeadingNewlines(replacement);
      var nls = Math.max(output.length - s1.length, replacement.length - s2.length);
      var separator = "\n\n".substring(0, nls);
      return s1 + separator + s2;
    }
    function canConvert(input) {
      return input != null && (typeof input === "string" || input.nodeType && (input.nodeType === 1 || input.nodeType === 9 || input.nodeType === 11));
    }
    module2.exports = TurndownService;
  }
});

// node_modules/.pnpm/turndown-plugin-gfm@1.0.2/node_modules/turndown-plugin-gfm/lib/turndown-plugin-gfm.cjs.js
var require_turndown_plugin_gfm_cjs = __commonJS({
  "node_modules/.pnpm/turndown-plugin-gfm@1.0.2/node_modules/turndown-plugin-gfm/lib/turndown-plugin-gfm.cjs.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var highlightRegExp = /highlight-(?:text|source)-([a-z0-9]+)/;
    function highlightedCodeBlock(turndownService) {
      turndownService.addRule("highlightedCodeBlock", {
        filter: function(node) {
          var firstChild = node.firstChild;
          return node.nodeName === "DIV" && highlightRegExp.test(node.className) && firstChild && firstChild.nodeName === "PRE";
        },
        replacement: function(content, node, options) {
          var className = node.className || "";
          var language = (className.match(highlightRegExp) || [null, ""])[1];
          return "\n\n" + options.fence + language + "\n" + node.firstChild.textContent + "\n" + options.fence + "\n\n";
        }
      });
    }
    function strikethrough(turndownService) {
      turndownService.addRule("strikethrough", {
        filter: ["del", "s", "strike"],
        replacement: function(content) {
          return "~" + content + "~";
        }
      });
    }
    var indexOf = Array.prototype.indexOf;
    var every = Array.prototype.every;
    var rules = {};
    rules.tableCell = {
      filter: ["th", "td"],
      replacement: function(content, node) {
        return cell(content, node);
      }
    };
    rules.tableRow = {
      filter: "tr",
      replacement: function(content, node) {
        var borderCells = "";
        var alignMap = { left: ":--", right: "--:", center: ":-:" };
        if (isHeadingRow(node)) {
          for (var i = 0; i < node.childNodes.length; i++) {
            var border = "---";
            var align = (node.childNodes[i].getAttribute("align") || "").toLowerCase();
            if (align) border = alignMap[align] || border;
            borderCells += cell(border, node.childNodes[i]);
          }
        }
        return "\n" + content + (borderCells ? "\n" + borderCells : "");
      }
    };
    rules.table = {
      // Only convert tables with a heading row.
      // Tables with no heading row are kept using `keep` (see below).
      filter: function(node) {
        return node.nodeName === "TABLE" && isHeadingRow(node.rows[0]);
      },
      replacement: function(content) {
        content = content.replace("\n\n", "\n");
        return "\n\n" + content + "\n\n";
      }
    };
    rules.tableSection = {
      filter: ["thead", "tbody", "tfoot"],
      replacement: function(content) {
        return content;
      }
    };
    function isHeadingRow(tr) {
      var parentNode = tr.parentNode;
      return parentNode.nodeName === "THEAD" || parentNode.firstChild === tr && (parentNode.nodeName === "TABLE" || isFirstTbody(parentNode)) && every.call(tr.childNodes, function(n) {
        return n.nodeName === "TH";
      });
    }
    function isFirstTbody(element) {
      var previousSibling = element.previousSibling;
      return element.nodeName === "TBODY" && (!previousSibling || previousSibling.nodeName === "THEAD" && /^\s*$/i.test(previousSibling.textContent));
    }
    function cell(content, node) {
      var index = indexOf.call(node.parentNode.childNodes, node);
      var prefix = " ";
      if (index === 0) prefix = "| ";
      return prefix + content + " |";
    }
    function tables(turndownService) {
      turndownService.keep(function(node) {
        return node.nodeName === "TABLE" && !isHeadingRow(node.rows[0]);
      });
      for (var key in rules) turndownService.addRule(key, rules[key]);
    }
    function taskListItems(turndownService) {
      turndownService.addRule("taskListItems", {
        filter: function(node) {
          return node.type === "checkbox" && node.parentNode.nodeName === "LI";
        },
        replacement: function(content, node) {
          return (node.checked ? "[x]" : "[ ]") + " ";
        }
      });
    }
    function gfm(turndownService) {
      turndownService.use([
        highlightedCodeBlock,
        strikethrough,
        tables,
        taskListItems
      ]);
    }
    exports2.gfm = gfm;
    exports2.highlightedCodeBlock = highlightedCodeBlock;
    exports2.strikethrough = strikethrough;
    exports2.tables = tables;
    exports2.taskListItems = taskListItems;
  }
});

// integrations/markdown-toolkit/source/tables.js
var require_tables = __commonJS({
  "integrations/markdown-toolkit/source/tables.js"(exports2, module2) {
    "use strict";
    function splitTableRow(line) {
      let value = line.trim();
      if (value.startsWith("|")) value = value.slice(1);
      if (value.endsWith("|") && !value.endsWith("\\|")) value = value.slice(0, -1);
      const cells = [];
      let cell = "";
      let escaped = false;
      let backticks = 0;
      for (const character of value) {
        if (escaped) {
          cell += character;
          escaped = false;
          continue;
        }
        if (character === "\\") {
          cell += character;
          escaped = true;
          continue;
        }
        if (character === "`") {
          backticks = backticks ? 0 : 1;
          cell += character;
          continue;
        }
        if (character === "|" && !backticks) {
          cells.push(cell.trim());
          cell = "";
          continue;
        }
        cell += character;
      }
      cells.push(cell.trim());
      return cells;
    }
    function isSeparatorRow(line) {
      const cells = splitTableRow(line);
      return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
    }
    function formatTableLines(lines) {
      if (lines.length < 2 || !isSeparatorRow(lines[1])) return lines;
      const rows = lines.map(splitTableRow);
      const columns = Math.max(...rows.map((row) => row.length));
      const alignments = Array.from({ length: columns }, (_, index) => {
        const marker = (rows[1][index] || "---").replace(/\s/g, "");
        return { left: marker.startsWith(":"), right: marker.endsWith(":") };
      });
      const widths = Array.from({ length: columns }, (_, index) => Math.max(
        3 + Number(alignments[index].left) + Number(alignments[index].right),
        ...rows.filter((_row, rowIndex) => rowIndex !== 1).map((row) => (row[index] || "").length)
      ));
      return rows.map((row, rowIndex) => {
        const cells = Array.from({ length: columns }, (_, index) => {
          if (rowIndex === 1) {
            const alignment = alignments[index];
            const dashCount = Math.max(3, widths[index] - Number(alignment.left) - Number(alignment.right));
            return `${alignment.left ? ":" : ""}${"-".repeat(dashCount)}${alignment.right ? ":" : ""}`.padEnd(widths[index], "-");
          }
          return (row[index] || "").padEnd(widths[index], " ");
        });
        return `| ${cells.join(" | ")} |`;
      });
    }
    function formatMarkdownTables2(markdown) {
      const lines = markdown.split(/\r?\n/);
      const output = [];
      for (let index = 0; index < lines.length; ) {
        if (index + 1 < lines.length && lines[index].includes("|") && isSeparatorRow(lines[index + 1])) {
          let end = index + 2;
          while (end < lines.length && lines[end].includes("|") && lines[end].trim()) end++;
          output.push(...formatTableLines(lines.slice(index, end)));
          index = end;
        } else {
          output.push(lines[index++]);
        }
      }
      return output.join("\n");
    }
    module2.exports = { formatMarkdownTables: formatMarkdownTables2, formatTableLines, isSeparatorRow, splitTableRow };
  }
});

// integrations/markdown-toolkit/source/html-to-markdown.js
var require_html_to_markdown = __commonJS({
  "integrations/markdown-toolkit/source/html-to-markdown.js"(exports2, module2) {
    "use strict";
    var TurndownService = require_turndown_cjs();
    var { gfm } = require_turndown_plugin_gfm_cjs();
    var { formatMarkdownTables: formatMarkdownTables2 } = require_tables();
    function normalizeTables(html) {
      return html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) => {
        if (/<thead\b/i.test(table)) return table;
        const open = /^<table\b[^>]*>/i.exec(table)?.[0] || "<table>";
        const rows = table.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
        if (!rows.length) return table;
        const header = rows[0].replace(/<td\b/gi, "<th").replace(/<\/td>/gi, "</th>");
        return `${open}<thead>${header}</thead><tbody>${rows.slice(1).join("")}</tbody></table>`;
      });
    }
    function cleanHtml(html) {
      let result = html.replace(/<!--(?:Start|End)Fragment-->/g, "").replace(/<!--\[if\s[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, "").replace(/<\?(?:xml)[^?]*\?>/gi, "").replace(/<xml\b[\s\S]*?<\/xml>/gi, "").replace(/<\/?(?:o|w|m|v|st\d):[^>]*>/gi, "").replace(/<(script|style|meta|link|head|iframe|object|applet|form|textarea|select|button|svg|canvas|noscript)\b[\s\S]*?<\/\1>/gi, "").replace(/<(meta|link)\b[^>]*>/gi, "").replace(/\s+(?:class|id)=(?:"[^"]*"|'[^']*')/gi, "").replace(/\s+data-[a-z][a-z0-9-]*=(?:"[^"]*"|'[^']*')/gi, "").replace(/&nbsp;/gi, " ").replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
      result = result.replace(/<(span|font)\b[^>]*style="[^"]*font-weight:\s*(?:bold|[7-9]00)[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi, "<strong>$2</strong>").replace(/<(span|font)\b[^>]*style="[^"]*font-style:\s*italic[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi, "<em>$2</em>").replace(/<(span|font)\b[^>]*style="[^"]*line-through[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi, "<s>$2</s>").replace(/\s+style=(?:"[^"]*"|'[^']*')/gi, "");
      return normalizeTables(result);
    }
    var service;
    function getTurndown() {
      if (service) return service;
      service = new TurndownService({
        headingStyle: "atx",
        hr: "---",
        bulletListMarker: "-",
        codeBlockStyle: "fenced",
        emDelimiter: "*",
        strongDelimiter: "**"
      });
      service.use(gfm);
      service.addRule("highlight", {
        filter: "mark",
        replacement: (content) => content ? `==${content}==` : ""
      });
      service.addRule("fencedCodeBlock", {
        filter: (node) => node.nodeName === "PRE" && node.firstChild?.nodeName === "CODE",
        replacement: (_content, node) => {
          const codeNode = node.firstChild;
          const code = codeNode.textContent || "";
          const className = codeNode.getAttribute?.("class") || "";
          const language = /(?:language-|lang-|highlight-source-)([\w+#.-]+)/.exec(className)?.[1] || "";
          const fence = code.includes("```") ? "~~~~" : "```";
          return `

${fence}${language}
${code.replace(/\n$/, "")}
${fence}

`;
        }
      });
      return service;
    }
    function htmlToMarkdown(html) {
      try {
        const markdown = getTurndown().turndown(cleanHtml(html)).replace(/(?:\n[ \t]*){3,}/g, "\n\n").replace(/[^\S\n]+$/gm, "").replace(/\\-(?!-)/g, "-").trim();
        return formatMarkdownTables2(markdown);
      } catch {
        return "";
      }
    }
    function isTrivialHtml(html) {
      const inner = html.replace(/^<!--StartFragment-->/, "").replace(/<!--EndFragment-->$/, "").trim().replace(/^<(?:span|p|div)[^>]*>([\s\S]*)<\/(?:span|p|div)>$/i, "$1").trim();
      return !/<[a-z][^>]*>/i.test(inner);
    }
    module2.exports = { cleanHtml, htmlToMarkdown, isTrivialHtml, normalizeTables };
  }
});

// integrations/markdown-toolkit/source/paste.js
var require_paste = __commonJS({
  "integrations/markdown-toolkit/source/paste.js"(exports2, module2) {
    "use strict";
    var vscode2 = require("vscode");
    var { htmlToMarkdown, isTrivialHtml } = require_html_to_markdown();
    var pasteKind = vscode2.DocumentDropOrPasteEditKind.Empty.append("markdown", "paste", "html");
    function isInsideFence(text, offset) {
      const fences = text.slice(0, offset).match(/^(?:`{3,}|~{3,})/gm);
      return fences !== null && fences.length % 2 !== 0;
    }
    function isInsideMath(text, offset) {
      const markers = text.slice(0, offset).match(/\$\$/g);
      return markers !== null && markers.length % 2 !== 0;
    }
    function isInsideInlineCode(line, character) {
      let cursor = 0;
      while (cursor < character) {
        const opening = line.indexOf("`", cursor);
        if (opening < 0 || opening >= character) return false;
        let length = 1;
        while (line[opening + length] === "`") length++;
        const closing = line.indexOf("`".repeat(length), opening + length);
        if (closing < 0 || closing >= character) return true;
        cursor = closing + length;
      }
      return false;
    }
    var PasteAsMarkdownProvider = class {
      async provideDocumentPasteEdits(document, ranges, dataTransfer, _context, token) {
        if (!vscode2.workspace.getConfiguration("pasteAsMarkdown").get("enabled", true)) return;
        const text = document.getText();
        for (const range of ranges) {
          const offset = document.offsetAt(range.start);
          if (isInsideFence(text, offset) || isInsideMath(text, offset)) return;
          if (isInsideInlineCode(document.lineAt(range.start.line).text, range.start.character)) return;
        }
        if (dataTransfer.get("vscode-editor-data")) return;
        const item = dataTransfer.get("text/html");
        if (!item) return;
        const html = await item.asString();
        if (!html || html.length > 25e6 || token.isCancellationRequested || isTrivialHtml(html)) return;
        const markdown = htmlToMarkdown(html);
        if (!markdown || token.isCancellationRequested) return;
        const plain = dataTransfer.get("text/plain");
        if (plain && (await plain.asString()).trim() === markdown.trim()) return;
        const edit = new vscode2.DocumentPasteEdit(markdown, "Paste as Markdown", pasteKind);
        edit.yieldTo = [vscode2.DocumentDropOrPasteEditKind.Empty.append("markdown", "link", "image")];
        return [edit];
      }
    };
    function registerPaste2(context) {
      context.subscriptions.push(vscode2.languages.registerDocumentPasteEditProvider(
        { language: "markdown" },
        new PasteAsMarkdownProvider(),
        { providedPasteEditKinds: [pasteKind], pasteMimeTypes: ["text/html"] }
      ));
    }
    module2.exports = { PasteAsMarkdownProvider, registerPaste: registerPaste2 };
  }
});

// integrations/markdown-toolkit/source/index.js
var vscode = require("vscode");
var { copyAsHtml } = require_copy_as_html();
var { registerExports } = require_export();
var { registerPaste } = require_paste();
var { formatMarkdownTables } = require_tables();
async function formatTables() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "markdown") {
    return vscode.window.showInformationMessage("Open a Markdown document to format a table.");
  }
  let range = editor.selection;
  if (range.isEmpty) {
    let start = range.active.line;
    let end = range.active.line;
    while (start > 0 && editor.document.lineAt(start - 1).text.includes("|")) start--;
    while (end + 1 < editor.document.lineCount && editor.document.lineAt(end + 1).text.includes("|")) end++;
    range = new vscode.Range(new vscode.Position(start, 0), editor.document.lineAt(end).range.end);
  }
  const source = editor.document.getText(range);
  const formatted = formatMarkdownTables(source);
  if (source === formatted) {
    return vscode.window.setStatusBarMessage("$(table) Markdown table is already formatted", 2e3);
  }
  await editor.edit((builder) => builder.replace(range, formatted));
}
function activate(context) {
  registerPaste(context);
  registerExports(context);
  context.subscriptions.push(
    vscode.commands.registerCommand("pasteAsMarkdown.copyAsHtml", copyAsHtml),
    vscode.commands.registerCommand("markdownToolkit.formatTable", formatTables)
  );
}
function deactivate() {
}
module.exports = { activate, deactivate, formatTables };
/*! Bundled license information:

@mixmark-io/domino/lib/style_parser.js:
  (**
   * @license
   * Copyright Google LLC All Rights Reserved.
   *
   * Use of this source code is governed by an MIT-style license that can be
   * found in the LICENSE file at https://angular.io/license
   *)
*/

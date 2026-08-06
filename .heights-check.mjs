var __defProp = Object.defineProperty;
var __require = /* @__PURE__ */ ((x5) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x5, {
  get: (a4, b5) => (typeof require !== "undefined" ? require : a4)[b5]
}) : x5)(function(x5) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x5 + '" is not supported');
});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/BigNumber.js
var BufferCtor = typeof globalThis === "undefined" ? void 0 : globalThis.Buffer;
var CAN_USE_BUFFER = BufferCtor != null && typeof BufferCtor.from === "function";
var HEX_CHAR_TO_VALUE = new Int8Array(256).fill(-1);
for (let i = 0; i < 10; i++) {
  HEX_CHAR_TO_VALUE[48 + i] = i;
}
for (let i = 0; i < 6; i++) {
  HEX_CHAR_TO_VALUE[65 + i] = 10 + i;
  HEX_CHAR_TO_VALUE[97 + i] = 10 + i;
}
var BigNumber = class _BigNumber {
  /**
   * @privateinitializer
   */
  static zeros = [
    "",
    "0",
    "00",
    "000",
    "0000",
    "00000",
    "000000",
    "0000000",
    "00000000",
    "000000000",
    "0000000000",
    "00000000000",
    "000000000000",
    "0000000000000",
    "00000000000000",
    "000000000000000",
    "0000000000000000",
    "00000000000000000",
    "000000000000000000",
    "0000000000000000000",
    "00000000000000000000",
    "000000000000000000000",
    "0000000000000000000000",
    "00000000000000000000000",
    "000000000000000000000000",
    "0000000000000000000000000"
  ];
  /**
   * @privateinitializer
   */
  static groupSizes = [
    0,
    0,
    25,
    16,
    12,
    11,
    10,
    9,
    8,
    8,
    7,
    7,
    7,
    7,
    6,
    6,
    6,
    6,
    6,
    6,
    6,
    5,
    5,
    5,
    5,
    5,
    5,
    5,
    5,
    5,
    5,
    5,
    5,
    5,
    5,
    5,
    5
  ];
  /**
   * @privateinitializer
   */
  static groupBases = [
    0,
    0,
    33554432,
    43046721,
    16777216,
    48828125,
    60466176,
    40353607,
    16777216,
    43046721,
    1e7,
    19487171,
    35831808,
    62748517,
    7529536,
    11390625,
    16777216,
    24137569,
    34012224,
    47045881,
    64e6,
    4084101,
    5153632,
    6436343,
    7962624,
    9765625,
    11881376,
    14348907,
    17210368,
    20511149,
    243e5,
    28629151,
    33554432,
    39135393,
    45435424,
    52521875,
    60466176
  ];
  /**
   * The word size of big number chunks.
   *
   * @property wordSize
   *
   * @example
   * console.log(BigNumber.wordSize);  // output: 26
   */
  static wordSize = 26;
  static WORD_SIZE_BIGINT = BigInt(_BigNumber.wordSize);
  static WORD_MASK = (1n << _BigNumber.WORD_SIZE_BIGINT) - 1n;
  static MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
  static MIN_SAFE_INTEGER_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
  static MAX_IMULN_ARG = 67108864 - 1;
  static MAX_NUMBER_CONSTRUCTOR_MAG_BIGINT = (1n << 53n) - 1n;
  _magnitude = 0n;
  _sign = 0;
  _nominalWordLength = 1;
  /**
   * Reduction context of the big number.
   *
   * @property red
   */
  red;
  /**
   * Negative flag. Indicates whether the big number is a negative number.
   * - If 0, the number is positive.
   * - If 1, the number is negative.
   *
   * @property negative
   */
  get negative() {
    return this._sign;
  }
  /**
   * Sets the negative flag. Only 0 (positive) or 1 (negative) are allowed.
   */
  set negative(val) {
    this.assert(val === 0 || val === 1, "Negative property must be 0 or 1");
    const newSign = val === 1 ? 1 : 0;
    if (this._magnitude === 0n) {
      this._sign = 0;
    } else {
      this._sign = newSign;
    }
  }
  get _computedWordsArray() {
    if (this._magnitude === 0n)
      return [0];
    const arr = [];
    let temp = this._magnitude;
    while (temp > 0n) {
      arr.push(Number(temp & _BigNumber.WORD_MASK));
      temp >>= _BigNumber.WORD_SIZE_BIGINT;
    }
    return arr.length > 0 ? arr : [0];
  }
  /**
   * Array of numbers, where each number represents a part of the value of the big number.
   *
   * @property words
   */
  get words() {
    const computed = this._computedWordsArray;
    if (this._nominalWordLength <= computed.length) {
      return computed;
    }
    const paddedWords = new Array(this._nominalWordLength).fill(0);
    for (let i = 0; i < computed.length; i++) {
      paddedWords[i] = computed[i];
    }
    return paddedWords;
  }
  /**
   * Sets the words array representing the value of the big number.
   */
  set words(newWords) {
    const oldSign = this._sign;
    let newMagnitude = 0n;
    const len = newWords.length > 0 ? newWords.length : 1;
    for (let i = len - 1; i >= 0; i--) {
      const wordVal = newWords[i] ?? 0;
      newMagnitude = newMagnitude << _BigNumber.WORD_SIZE_BIGINT | BigInt(wordVal & Number(_BigNumber.WORD_MASK));
    }
    this._magnitude = newMagnitude;
    this._sign = oldSign;
    this._nominalWordLength = len;
    this.normSign();
  }
  /**
   * Length of the words array.
   *
   * @property length
   */
  get length() {
    return Math.max(1, this._nominalWordLength);
  }
  /**
   * Checks whether a value is an instance of BigNumber. Regular JS numbers fail this check.
   *
   * @method isBN
   * @param num - The value to be checked.
   * @returns - Returns a boolean value determining whether or not the checked num parameter is a BigNumber.
   */
  static isBN(num) {
    if (num instanceof _BigNumber)
      return true;
    return num !== null && typeof num === "object" && num.constructor?.wordSize === _BigNumber.wordSize && Array.isArray(num.words);
  }
  /**
   * Returns the bigger value between two BigNumbers
   *
   * @method max
   * @param left - The first BigNumber to be compared.
   * @param right - The second BigNumber to be compared.
   * @returns - Returns the bigger BigNumber between left and right.
   */
  static max(left, right) {
    return left.cmp(right) > 0 ? left : right;
  }
  /**
   * Returns the smaller value between two BigNumbers
   *
   * @method min
   * @param left - The first BigNumber to be compared.
   * @param right - The second BigNumber to be compared.
   * @returns - Returns the smaller value between left and right.
   */
  static min(left, right) {
    return left.cmp(right) < 0 ? left : right;
  }
  /**
   * @constructor
   *
   * @param number - The number (various types accepted) to construct a BigNumber from. Default is 0.
   * @param base - The base of number provided. By default is 10.
   * @param endian - The endianness provided. By default is 'big endian'.
   */
  constructor(number = 0, base = 10, endian = "be") {
    this.red = null;
    number ??= 0;
    if (number === null) {
      this._initializeState(0n, 0);
      return;
    }
    if (typeof number === "bigint") {
      this._initializeState(number < 0n ? -number : number, number < 0n ? 1 : 0);
      this.normSign();
      return;
    }
    let effectiveBase = base;
    let effectiveEndian = endian;
    if (base === "le" || base === "be") {
      effectiveEndian = base;
      effectiveBase = 10;
    }
    if (typeof number === "number") {
      this.initNumber(number, effectiveEndian);
      return;
    }
    if (Array.isArray(number)) {
      this.initArray(number, effectiveEndian);
      return;
    }
    if (typeof number === "string") {
      this._initFromString(number, effectiveBase, effectiveEndian);
      return;
    }
    if (number !== 0) {
      this.assert(false, "Unsupported input type for BigNumber constructor");
    } else {
      this._initializeState(0n, 0);
    }
  }
  _initFromString(number, effectiveBase, effectiveEndian) {
    if (effectiveBase === "hex")
      effectiveBase = 16;
    this.assert(typeof effectiveBase === "number" && effectiveBase === (effectiveBase | 0) && effectiveBase >= 2 && effectiveBase <= 36, "Base must be an integer between 2 and 36");
    const originalNumberStr = number.toString().replace(/\s+/g, "");
    let start = 0;
    let sign3 = 0;
    if (originalNumberStr.startsWith("-")) {
      start++;
      sign3 = 1;
    } else if (originalNumberStr.startsWith("+")) {
      start++;
    }
    const numStr = originalNumberStr.substring(start);
    if (numStr.length === 0) {
      this._initializeState(0n, sign3 === 1 && originalNumberStr.startsWith("-") ? 1 : 0);
      this.normSign();
      return;
    }
    if (effectiveBase === 16) {
      this._initFromHexString(numStr, sign3, effectiveEndian);
    } else {
      this._initFromNonHexString(numStr, effectiveBase, sign3, effectiveEndian);
    }
  }
  _initFromHexString(numStr, sign3, effectiveEndian) {
    if (effectiveEndian === "le") {
      const bytes2 = [];
      let hexStr = numStr;
      if (hexStr.length % 2 !== 0)
        hexStr = "0" + hexStr;
      for (let i = 0; i < hexStr.length; i += 2) {
        const byteHex = hexStr.substring(i, i + 2);
        const byteVal = Number.parseInt(byteHex, 16);
        if (Number.isNaN(byteVal))
          throw new Error("Invalid character in " + hexStr);
        bytes2.push(byteVal);
      }
      this.initArray(bytes2, "le");
      this._sign = sign3;
      this.normSign();
    } else {
      let tempMagnitude;
      try {
        tempMagnitude = BigInt("0x" + numStr);
      } catch (_bigIntParseError) {
        throw new Error("Invalid character in " + numStr);
      }
      this._initializeState(tempMagnitude, sign3);
      this.normSign();
    }
  }
  _initFromNonHexString(numStr, base, sign3, effectiveEndian) {
    try {
      this._parseBaseString(numStr, base);
      this._sign = sign3;
      this.normSign();
      if (effectiveEndian === "le") {
        const currentSign = this._sign;
        this.initArray(this.toArray("be"), "le");
        this._sign = currentSign;
        this.normSign();
      }
    } catch (err) {
      const error = err;
      if (error.message.includes("Invalid character in string") || error.message.includes("Invalid digit for base") || error.message.startsWith("Invalid character:")) {
        throw new Error("Invalid character");
      }
      throw error;
    }
  }
  _bigIntToStringInBase(num, base) {
    if (num === 0n)
      return "0";
    if (base < 2 || base > 36)
      throw new Error("Base must be between 2 and 36");
    const digits = "0123456789abcdefghijklmnopqrstuvwxyz";
    let result = "";
    let currentNum = num > 0n ? num : -num;
    const bigBase = BigInt(base);
    while (currentNum > 0n) {
      result = digits[Number(currentNum % bigBase)] + result;
      currentNum /= bigBase;
    }
    return result;
  }
  _parseBaseString(numberStr, base) {
    if (numberStr.length === 0) {
      this._magnitude = 0n;
      this._finishInitialization();
      return;
    }
    this._magnitude = 0n;
    const bigBase = BigInt(base);
    let groupSize = _BigNumber.groupSizes[base];
    let groupBaseBigInt = BigInt(_BigNumber.groupBases[base]);
    if (groupSize === 0 || groupBaseBigInt === 0n) {
      groupSize = Math.floor(Math.log(67108863) / Math.log(base));
      if (groupSize === 0)
        groupSize = 1;
      groupBaseBigInt = bigBase ** BigInt(groupSize);
    }
    let currentPos = 0;
    const totalLen = numberStr.length;
    let firstChunkLen = totalLen % groupSize;
    if (firstChunkLen === 0 && totalLen > 0)
      firstChunkLen = groupSize;
    if (firstChunkLen > 0) {
      const chunkStr = numberStr.substring(currentPos, currentPos + firstChunkLen);
      this._magnitude = BigInt(this._parseBaseWord(chunkStr, base));
      currentPos += firstChunkLen;
    }
    while (currentPos < totalLen) {
      const chunkStr = numberStr.substring(currentPos, currentPos + groupSize);
      const wordVal = BigInt(this._parseBaseWord(chunkStr, base));
      this._magnitude = this._magnitude * groupBaseBigInt + wordVal;
      currentPos += groupSize;
    }
    this._finishInitialization();
  }
  _parseBaseWord(str, base) {
    let r3 = 0;
    for (let i = 0; i < str.length; i++) {
      const charCode = str.codePointAt(i);
      let digitVal;
      if (charCode >= 48 && charCode <= 57)
        digitVal = charCode - 48;
      else if (charCode >= 65 && charCode <= 90)
        digitVal = charCode - 65 + 10;
      else if (charCode >= 97 && charCode <= 122)
        digitVal = charCode - 97 + 10;
      else
        throw new Error("Invalid character: " + str[i]);
      if (digitVal >= base)
        throw new Error("Invalid character");
      r3 = r3 * base + digitVal;
    }
    return r3;
  }
  _initializeState(magnitude, sign3) {
    this._magnitude = magnitude;
    this._sign = magnitude === 0n ? 0 : sign3;
    this._finishInitialization();
  }
  _finishInitialization() {
    if (this._magnitude === 0n) {
      this._nominalWordLength = 1;
      this._sign = 0;
    } else {
      const bitLen = this._magnitude.toString(2).length;
      this._nominalWordLength = Math.max(1, Math.ceil(bitLen / _BigNumber.wordSize));
    }
  }
  assert(val, msg = "Assertion failed") {
    if (!val)
      throw new Error(msg);
  }
  initNumber(number, endian = "be") {
    this.assert(BigInt(Math.abs(number)) <= _BigNumber.MAX_NUMBER_CONSTRUCTOR_MAG_BIGINT, "The number is larger than 2 ^ 53 (unsafe)");
    this.assert(number % 1 === 0, "Number must be an integer for BigNumber conversion");
    this._initializeState(BigInt(Math.abs(number)), number < 0 ? 1 : 0);
    if (endian === "le") {
      const currentSign = this._sign;
      const beBytes = this.toArray("be");
      this.initArray(beBytes, "le");
      this._sign = currentSign;
      this.normSign();
    }
    return this;
  }
  initArray(bytes2, endian) {
    if (bytes2.length === 0) {
      this._initializeState(0n, 0);
      return this;
    }
    let magnitude = 0n;
    if (endian === "be") {
      for (const byte of bytes2)
        magnitude = magnitude << 8n | BigInt(byte & 255);
    } else {
      for (let i = bytes2.length - 1; i >= 0; i--)
        magnitude = magnitude << 8n | BigInt(bytes2[i] & 255);
    }
    this._initializeState(magnitude, 0);
    return this;
  }
  copy(dest) {
    dest._magnitude = this._magnitude;
    dest._sign = this._sign;
    dest._nominalWordLength = this._nominalWordLength;
    dest.red = this.red;
  }
  static move(dest, src) {
    dest._magnitude = src._magnitude;
    dest._sign = src._sign;
    dest._nominalWordLength = src._nominalWordLength;
    dest.red = src.red;
  }
  clone() {
    const r3 = new _BigNumber(0n);
    this.copy(r3);
    return r3;
  }
  expand(size) {
    this.assert(size >= 0, "Expand size must be non-negative");
    this._nominalWordLength = Math.max(this._nominalWordLength, size, 1);
    return this;
  }
  strip() {
    this._finishInitialization();
    return this.normSign();
  }
  normSign() {
    if (this._magnitude === 0n) {
      this._sign = 0;
    }
    return this;
  }
  inspect() {
    return (this.red === null ? "<BN: " : "<BN-R: ") + this.toString(16) + ">";
  }
  _getMinimalHex() {
    if (this._magnitude === 0n)
      return "0";
    return this._magnitude.toString(16);
  }
  /**
   * Converts the BigNumber instance to a string representation.
   *
   * @method toString
   * @param base - The base for representing number. Default is 10. Other accepted values are 16 and 'hex'.
   * @param padding - Represents the minimum number of digits to represent the BigNumber as a string. Default is 1.
   * @returns The string representation of the BigNumber instance
   */
  toString(base = 10, padding = 1) {
    if (base === 16 || base === "hex") {
      let hexStr = this._getMinimalHex();
      if (padding > 1) {
        if (hexStr !== "0" && hexStr.length % 2 !== 0) {
          hexStr = "0" + hexStr;
        }
        while (hexStr.length % padding !== 0) {
          hexStr = "0" + hexStr;
        }
      }
      return (this.isNeg() ? "-" : "") + hexStr;
    }
    if (typeof base !== "number" || base < 2 || base > 36 || base % 1 !== 0)
      throw new Error("Base should be an integer between 2 and 36");
    return this.toBaseString(base, padding);
  }
  toBaseString(base, padding) {
    if (this._magnitude === 0n) {
      let out2 = "0";
      if (padding > 1) {
        while (out2.length < padding)
          out2 = "0" + out2;
      }
      return out2;
    }
    let groupSize = _BigNumber.groupSizes[base];
    let groupBaseBigInt = BigInt(_BigNumber.groupBases[base]);
    if (groupSize === 0 || groupBaseBigInt === 0n) {
      groupSize = Math.floor(Math.log(Number.MAX_SAFE_INTEGER) / Math.log(base));
      if (groupSize === 0)
        groupSize = 1;
      groupBaseBigInt = BigInt(base) ** BigInt(groupSize);
    }
    let out = "";
    let tempMag = this._magnitude;
    while (tempMag > 0n) {
      const remainder = tempMag % groupBaseBigInt;
      tempMag /= groupBaseBigInt;
      const chunkStr = this._bigIntToStringInBase(remainder, base);
      out = (tempMag > 0n ? this._zeroPaddedChunk(chunkStr, groupSize) : chunkStr) + out;
    }
    if (padding > 0) {
      while (out.length < padding)
        out = "0" + out;
    }
    return (this._sign === 1 ? "-" : "") + out;
  }
  /** Returns a chunk string zero-padded to groupSize (used by toBaseString for interior chunks). */
  _zeroPaddedChunk(chunkStr, groupSize) {
    const zerosToPrepend = groupSize - chunkStr.length;
    if (zerosToPrepend <= 0)
      return chunkStr;
    if (zerosToPrepend < _BigNumber.zeros.length)
      return _BigNumber.zeros[zerosToPrepend] + chunkStr;
    return "0".repeat(zerosToPrepend) + chunkStr;
  }
  /**
   * Converts the BigNumber instance to a JavaScript number.
   * Please note that JavaScript numbers are only precise up to 53 bits.
   *
   * @method toNumber
   * @throws If the BigNumber instance cannot be safely stored in a JavaScript number
   * @returns The JavaScript number representation of the BigNumber instance.
   */
  toNumber() {
    const val = this._getSignedValue();
    if (val > _BigNumber.MAX_SAFE_INTEGER_BIGINT || val < _BigNumber.MIN_SAFE_INTEGER_BIGINT)
      throw new Error("Number can only safely store up to 53 bits");
    return Number(val);
  }
  /**
   * Returns the signed BigInt representation of this BigNumber without any safety checks.
   *
   * @method toBigInt
   * @returns bigint value for this BigNumber.
   */
  toBigInt() {
    return this._getSignedValue();
  }
  /**
   * Converts the BigNumber instance to a JSON-formatted string.
   *
   * @method toJSON
   * @returns The JSON string representation of the BigNumber instance.
   */
  toJSON() {
    const hex = this._getMinimalHex();
    return (this.isNeg() ? "-" : "") + hex;
  }
  toArrayLikeGeneric(res, isLE) {
    let tempMag = this._magnitude;
    let position = isLE ? 0 : res.length - 1;
    const increment = isLE ? 1 : -1;
    for (let k4 = 0; k4 < res.length; ++k4) {
      if (tempMag === 0n && position >= 0 && position < res.length) {
        res[position] = 0;
      } else if (position >= 0 && position < res.length) {
        res[position] = Number(tempMag & 0xffn);
      } else {
        break;
      }
      tempMag >>= 8n;
      position += increment;
    }
  }
  /**
   * Converts the BigNumber instance to an array of bytes.
   *
   * @method toArray
   * @param endian - Endianness of the output array, defaults to 'be'.
   * @param length - Optional length of the output array.
   * @returns Array of bytes representing the BigNumber.
   */
  toArray(endian = "be", length) {
    this.strip();
    const actualByteLength = this.byteLength();
    const reqLength = length ?? Math.max(1, actualByteLength);
    this.assert(actualByteLength <= reqLength, "byte array longer than desired length");
    this.assert(reqLength > 0, "Requested array length <= 0");
    const res = new Array(reqLength).fill(0);
    if (this._magnitude === 0n && reqLength > 0)
      return res;
    if (this._magnitude === 0n && reqLength === 0)
      return [];
    this.toArrayLikeGeneric(res, endian === "le");
    return res;
  }
  /**
   * Calculates the number of bits required to represent the BigNumber.
   *
   * @method bitLength
   * @returns The bit length of the BigNumber.
   */
  bitLength() {
    if (this._magnitude === 0n) {
      return 0;
    }
    return this._magnitude.toString(2).length;
  }
  /**
   * Converts a BigNumber to an array of bits.
   *
   * @method toBitArray
   * @param num - The BigNumber to convert.
   * @returns An array of bits.
   */
  static toBitArray(num) {
    const len = num.bitLength();
    if (len === 0)
      return [];
    const w3 = new Array(len);
    const mag = num._magnitude;
    for (let bit = 0; bit < len; bit++) {
      w3[bit] = (mag >> BigInt(bit) & 1n) === 0n ? 0 : 1;
    }
    return w3;
  }
  /**
   * Instance version of {@link toBitArray}.
   */
  toBitArray() {
    return _BigNumber.toBitArray(this);
  }
  /**
   * Returns the number of trailing zero bits in the big number.
   *
   * @method zeroBits
   * @returns Returns the number of trailing zero bits
   * in the binary representation of the big number.
   *
   * @example
   * const bn = new BigNumber('8'); // binary: 1000
   * const zeroBits = bn.zeroBits(); // 3
   */
  zeroBits() {
    if (this._magnitude === 0n)
      return 0;
    let c4 = 0;
    let t3 = this._magnitude;
    while ((t3 & 1n) === 0n && t3 !== 0n) {
      c4++;
      t3 >>= 1n;
    }
    return c4;
  }
  /**
   * Calculates the number of bytes required to represent the BigNumber.
   *
   * @method byteLength
   * @returns The byte length of the BigNumber.
   */
  byteLength() {
    if (this._magnitude === 0n) {
      return 0;
    }
    return Math.ceil(this.bitLength() / 8);
  }
  _getSignedValue() {
    return this._sign === 1 ? -this._magnitude : this._magnitude;
  }
  _setValueFromSigned(sVal) {
    if (sVal < 0n) {
      this._magnitude = -sVal;
      this._sign = 1;
    } else {
      this._magnitude = sVal;
      this._sign = 0;
    }
    this._finishInitialization();
    this.normSign();
  }
  toTwos(width) {
    this.assert(width >= 0);
    const Bw = BigInt(width);
    let v3 = this._getSignedValue();
    if (this._sign === 1 && this._magnitude !== 0n)
      v3 = (1n << Bw) + v3;
    const m4 = (1n << Bw) - 1n;
    v3 &= m4;
    const r3 = new _BigNumber(0n);
    r3._initializeState(v3, 0);
    return r3;
  }
  fromTwos(width) {
    this.assert(width >= 0);
    const Bw = BigInt(width);
    const m4 = this._magnitude;
    if (width > 0 && (m4 >> Bw - 1n & 1n) !== 0n && this._sign === 0) {
      const sVal = m4 - (1n << Bw);
      const r3 = new _BigNumber(0n);
      r3._setValueFromSigned(sVal);
      return r3;
    }
    return this.clone();
  }
  isNeg() {
    return this._sign === 1 && this._magnitude !== 0n;
  }
  neg() {
    return this.clone().ineg();
  }
  ineg() {
    if (this._magnitude !== 0n) {
      this._sign = this._sign === 1 ? 0 : 1;
    }
    return this;
  }
  _iuop(num, op, isXor = false) {
    const newMag = op(this._magnitude, num._magnitude);
    let targetNominalLength = this._nominalWordLength;
    if (isXor)
      targetNominalLength = Math.max(this.length, num.length);
    this._magnitude = newMag;
    this._finishInitialization();
    if (isXor)
      this._nominalWordLength = Math.max(this._nominalWordLength, targetNominalLength);
    return this.strip();
  }
  iuor(num) {
    return this._iuop(num, (a4, b5) => a4 | b5);
  }
  iuand(num) {
    return this._iuop(num, (a4, b5) => a4 & b5);
  }
  iuxor(num) {
    return this._iuop(num, (a4, b5) => a4 ^ b5, true);
  }
  _iop(num, op, isXor = false) {
    this.assert(this._sign === 0 && num._sign === 0);
    return this._iuop(num, op, isXor);
  }
  ior(num) {
    return this._iop(num, (a4, b5) => a4 | b5);
  }
  iand(num) {
    return this._iop(num, (a4, b5) => a4 & b5);
  }
  ixor(num) {
    return this._iop(num, (a4, b5) => a4 ^ b5, true);
  }
  _uop_new(num, opName) {
    if (this.length >= num.length) {
      return this.clone()[opName](num);
    }
    return num.clone()[opName](this);
  }
  or(num) {
    this.assert(this._sign === 0 && num._sign === 0);
    return this._uop_new(num, "iuor");
  }
  uor(num) {
    return this._uop_new(num, "iuor");
  }
  and(num) {
    this.assert(this._sign === 0 && num._sign === 0);
    return this._uop_new(num, "iuand");
  }
  uand(num) {
    return this._uop_new(num, "iuand");
  }
  xor(num) {
    this.assert(this._sign === 0 && num._sign === 0);
    return this._uop_new(num, "iuxor");
  }
  uxor(num) {
    return this._uop_new(num, "iuxor");
  }
  inotn(width) {
    this.assert(typeof width === "number" && width >= 0);
    const Bw = BigInt(width);
    const m4 = (1n << Bw) - 1n;
    this._magnitude = ~this._magnitude & m4;
    const wfw = width === 0 ? 1 : Math.ceil(width / _BigNumber.wordSize);
    this._nominalWordLength = Math.max(1, wfw);
    this.strip();
    this._nominalWordLength = Math.max(this._nominalWordLength, Math.max(1, wfw));
    return this;
  }
  notn(width) {
    return this.clone().inotn(width);
  }
  setn(bit, val) {
    this.assert(typeof bit === "number" && bit >= 0);
    const Bb = BigInt(bit);
    if (val === 1 || val === true)
      this._magnitude |= 1n << Bb;
    else
      this._magnitude &= ~(1n << Bb);
    const wnb = Math.floor(bit / _BigNumber.wordSize) + 1;
    this._nominalWordLength = Math.max(this._nominalWordLength, wnb);
    this._finishInitialization();
    return this.strip();
  }
  iadd(num) {
    this._setValueFromSigned(this._getSignedValue() + num._getSignedValue());
    return this;
  }
  add(num) {
    const r3 = new _BigNumber(0n);
    r3._setValueFromSigned(this._getSignedValue() + num._getSignedValue());
    return r3;
  }
  isub(num) {
    this._setValueFromSigned(this._getSignedValue() - num._getSignedValue());
    return this;
  }
  sub(num) {
    const r3 = new _BigNumber(0n);
    r3._setValueFromSigned(this._getSignedValue() - num._getSignedValue());
    return r3;
  }
  mul(num) {
    const r3 = new _BigNumber(0n);
    r3._magnitude = this._magnitude * num._magnitude;
    r3._sign = r3._magnitude === 0n ? 0 : this._sign ^ num._sign;
    r3._nominalWordLength = this.length + num.length;
    r3.red = null;
    return r3.normSign();
  }
  imul(num) {
    this._magnitude *= num._magnitude;
    this._sign = this._magnitude === 0n ? 0 : this._sign ^ num._sign;
    this._nominalWordLength = this.length + num.length;
    this.red = null;
    return this.normSign();
  }
  imuln(num) {
    this.assert(typeof num === "number", "Assertion failed");
    this.assert(Math.abs(num) <= _BigNumber.MAX_IMULN_ARG, "Assertion failed");
    this._setValueFromSigned(this._getSignedValue() * BigInt(num));
    return this;
  }
  muln(num) {
    return this.clone().imuln(num);
  }
  sqr() {
    const r3 = new _BigNumber(0n);
    r3._magnitude = this._magnitude * this._magnitude;
    r3._sign = 0;
    r3._nominalWordLength = this.length * 2;
    r3.red = null;
    return r3;
  }
  isqr() {
    this._magnitude *= this._magnitude;
    this._sign = 0;
    this._nominalWordLength = this.length * 2;
    this.red = null;
    return this;
  }
  pow(num) {
    this.assert(num._sign === 0, "Exponent for pow must be non-negative");
    if (num.isZero())
      return new _BigNumber(1n);
    const res = new _BigNumber(1n);
    const currentBase = this.clone();
    const exp = num.clone();
    const baseIsNegative = currentBase.isNeg();
    const expIsOdd = exp.isOdd();
    if (baseIsNegative)
      currentBase.ineg();
    while (!exp.isZero()) {
      if (exp.isOdd()) {
        res.imul(currentBase);
      }
      currentBase.isqr();
      exp.iushrn(1);
    }
    if (baseIsNegative && expIsOdd) {
      res.ineg();
    }
    return res;
  }
  static normalizeNonNegativeBigInt(value, label) {
    if (typeof value === "number") {
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0)
        throw new Error(`${label} must be a non-negative integer`);
      return BigInt(value);
    }
    if (value < 0n)
      throw new Error(`${label} must be a non-negative integer`);
    return value;
  }
  iushln(bits) {
    const normalizedBits = _BigNumber.normalizeNonNegativeBigInt(bits, "Shift bits");
    if (normalizedBits === 0n)
      return this;
    this._magnitude <<= normalizedBits;
    this._finishInitialization();
    return this.strip();
  }
  ishln(bits) {
    this.assert(this._sign === 0, "ishln requires positive number");
    return this.iushln(bits);
  }
  iushrn(bits, hint, extended) {
    const normalizedBits = _BigNumber.normalizeNonNegativeBigInt(bits, "Shift bits");
    if (normalizedBits === 0n) {
      if (extended != null)
        extended._initializeState(0n, 0);
      return this;
    }
    if (extended != null) {
      const m4 = (1n << normalizedBits) - 1n;
      const sOut = this._magnitude & m4;
      extended._initializeState(sOut, 0);
    }
    this._magnitude >>= normalizedBits;
    this._finishInitialization();
    return this.strip();
  }
  ishrn(bits, hint, extended) {
    this.assert(this._sign === 0, "ishrn requires positive number");
    return this.iushrn(bits, hint, extended);
  }
  shln(bits) {
    return this.clone().ishln(bits);
  }
  ushln(bits) {
    return this.clone().iushln(bits);
  }
  shrn(bits) {
    return this.clone().ishrn(bits);
  }
  ushrn(bits) {
    return this.clone().iushrn(bits);
  }
  testn(bit) {
    this.assert(typeof bit === "number" && bit >= 0);
    return (this._magnitude >> BigInt(bit) & 1n) !== 0n;
  }
  imaskn(bits) {
    this.assert(typeof bits === "number" && bits >= 0);
    this.assert(this._sign === 0, "imaskn works only with positive numbers");
    const Bb = BigInt(bits);
    const m4 = Bb === 0n ? 0n : (1n << Bb) - 1n;
    this._magnitude &= m4;
    const wfm = bits === 0 ? 1 : Math.max(1, Math.ceil(bits / _BigNumber.wordSize));
    this._nominalWordLength = wfm;
    this._finishInitialization();
    this._nominalWordLength = Math.max(this._nominalWordLength, wfm);
    return this.strip();
  }
  maskn(bits) {
    return this.clone().imaskn(bits);
  }
  iaddn(num) {
    this.assert(typeof num === "number");
    this.assert(Math.abs(num) <= _BigNumber.MAX_IMULN_ARG, "num is too large");
    this._setValueFromSigned(this._getSignedValue() + BigInt(num));
    return this;
  }
  _iaddn(num) {
    return this.iaddn(num);
  }
  isubn(num) {
    this.assert(typeof num === "number");
    this.assert(Math.abs(num) <= _BigNumber.MAX_IMULN_ARG, "Assertion failed");
    this._setValueFromSigned(this._getSignedValue() - BigInt(num));
    return this;
  }
  addn(num) {
    return this.clone().iaddn(num);
  }
  subn(num) {
    return this.clone().isubn(num);
  }
  iabs() {
    this._sign = 0;
    return this;
  }
  abs() {
    return this.clone().iabs();
  }
  divmod(num, mode, positive) {
    this.assert(!num.isZero(), "Division by zero");
    if (this.isZero()) {
      const z2 = new _BigNumber(0n);
      return { div: mode === "mod" ? null : z2, mod: mode === "div" ? null : z2 };
    }
    const tV = this._getSignedValue();
    const nV = num._getSignedValue();
    const dV = mode !== "mod" ? tV / nV : null;
    const mV = this._computeMod(tV, nV, mode, positive);
    return { div: this._bigNumberFromSigned(dV), mod: this._bigNumberFromSigned(mV) };
  }
  _computeMod(tV, nV, mode, positive) {
    if (mode === "div")
      return null;
    let mV = tV % nV;
    if (positive === true && mV < 0n)
      mV += nV < 0n ? -nV : nV;
    return mV;
  }
  _bigNumberFromSigned(v3) {
    if (v3 === null)
      return null;
    const r3 = new _BigNumber(0n);
    r3._setValueFromSigned(v3);
    return r3;
  }
  div(num) {
    return this.divmod(num, "div", false).div;
  }
  mod(num) {
    return this.divmod(num, "mod", false).mod;
  }
  umod(num) {
    return this.divmod(num, "mod", true).mod;
  }
  divRound(num) {
    this.assert(!num.isZero());
    const tV = this._getSignedValue();
    const nV = num._getSignedValue();
    let d5 = tV / nV;
    const m4 = tV % nV;
    if (m4 === 0n) {
      const r4 = new _BigNumber(0n);
      r4._setValueFromSigned(d5);
      return r4;
    }
    const absM = m4 < 0n ? -m4 : m4;
    const absNV = nV < 0n ? -nV : nV;
    if (absM * 2n >= absNV) {
      if (tV > 0n && nV > 0n || tV < 0n && nV < 0n) {
        d5 += 1n;
      } else {
        d5 -= 1n;
      }
    }
    const r3 = new _BigNumber(0n);
    r3._setValueFromSigned(d5);
    return r3;
  }
  modrn(numArg) {
    this.assert(numArg !== 0, "Division by zero in modrn");
    const absDivisor = BigInt(Math.abs(numArg));
    if (absDivisor === 0n)
      throw new Error("Division by zero in modrn");
    const remainderMag = this._magnitude % absDivisor;
    return numArg < 0 ? Number(-remainderMag) : Number(remainderMag);
  }
  idivn(num) {
    this.assert(num !== 0);
    this.assert(Math.abs(num) <= _BigNumber.MAX_IMULN_ARG, "num is too large");
    this._setValueFromSigned(this._getSignedValue() / BigInt(num));
    return this;
  }
  divn(num) {
    return this.clone().idivn(num);
  }
  egcd(p5) {
    this.assert(p5._sign === 0, "p must not be negative");
    this.assert(!p5.isZero(), "p must not be zero");
    let uV = this._getSignedValue();
    let vV = p5._magnitude;
    let a4 = 1n;
    let pa = 0n;
    let b5 = 0n;
    let pb = 1n;
    while (vV !== 0n) {
      const q3 = uV / vV;
      let t3 = vV;
      vV = uV % vV;
      uV = t3;
      t3 = pa;
      pa = a4 - q3 * pa;
      a4 = t3;
      t3 = pb;
      pb = b5 - q3 * pb;
      b5 = t3;
    }
    const ra = new _BigNumber(0n);
    ra._setValueFromSigned(a4);
    const rb = new _BigNumber(0n);
    rb._setValueFromSigned(b5);
    const rg = new _BigNumber(0n);
    rg._initializeState(uV < 0n ? -uV : uV, 0);
    return { a: ra, b: rb, gcd: rg };
  }
  gcd(num) {
    let u3 = this._magnitude;
    let v3 = num._magnitude;
    if (u3 === 0n) {
      const r3 = new _BigNumber(0n);
      r3._setValueFromSigned(v3);
      return r3.iabs();
    }
    if (v3 === 0n) {
      const r3 = new _BigNumber(0n);
      r3._setValueFromSigned(u3);
      return r3.iabs();
    }
    while (v3 !== 0n) {
      const t3 = u3 % v3;
      u3 = v3;
      v3 = t3;
    }
    const res = new _BigNumber(0n);
    res._initializeState(u3, 0);
    return res;
  }
  invm(num) {
    this.assert(!num.isZero() && num._sign === 0, "Modulus for invm must be positive and non-zero");
    const eg = this.egcd(num);
    if (!eg.gcd.eqn(1)) {
      throw new Error("Inverse does not exist (numbers are not coprime).");
    }
    return eg.a.umod(num);
  }
  isEven() {
    return this._magnitude % 2n === 0n;
  }
  isOdd() {
    return this._magnitude % 2n === 1n;
  }
  andln(num) {
    this.assert(num >= 0);
    return Number(this._magnitude & BigInt(num));
  }
  bincn(bit) {
    this.assert(typeof bit === "number" && bit >= 0);
    const BVal = 1n << BigInt(bit);
    this._setValueFromSigned(this._getSignedValue() + BVal);
    return this;
  }
  isZero() {
    return this._magnitude === 0n;
  }
  cmpn(num) {
    this.assert(Math.abs(num) <= _BigNumber.MAX_IMULN_ARG, "Number is too big");
    const tV = this._getSignedValue();
    const nV = BigInt(num);
    if (tV < nV) {
      return -1;
    }
    if (tV > nV) {
      return 1;
    }
    return 0;
  }
  cmp(num) {
    const tV = this._getSignedValue();
    const nV = num._getSignedValue();
    if (tV < nV) {
      return -1;
    }
    if (tV > nV) {
      return 1;
    }
    return 0;
  }
  ucmp(num) {
    if (this._magnitude < num._magnitude) {
      return -1;
    }
    if (this._magnitude > num._magnitude) {
      return 1;
    }
    return 0;
  }
  gtn(num) {
    return this.cmpn(num) === 1;
  }
  gt(num) {
    return this.cmp(num) === 1;
  }
  gten(num) {
    return this.cmpn(num) >= 0;
  }
  gte(num) {
    return this.cmp(num) >= 0;
  }
  ltn(num) {
    return this.cmpn(num) === -1;
  }
  lt(num) {
    return this.cmp(num) === -1;
  }
  lten(num) {
    return this.cmpn(num) <= 0;
  }
  lte(num) {
    return this.cmp(num) <= 0;
  }
  eqn(num) {
    return this.cmpn(num) === 0;
  }
  eq(num) {
    return this.cmp(num) === 0;
  }
  toRed(ctx) {
    this.assert(this.red == null, "Already a number in reduction context");
    this.assert(this._sign === 0, "toRed works only with positives");
    return ctx.convertTo(this).forceRed(ctx);
  }
  fromRed() {
    this.assert(this.red, "fromRed works only with numbers in reduction context");
    return this.red.convertFrom(this);
  }
  forceRed(ctx) {
    this.red = ctx;
    return this;
  }
  redAdd(num) {
    this.assert(this.red, "redAdd works only with red numbers");
    return this.red.add(this, num);
  }
  redIAdd(num) {
    this.assert(this.red, "redIAdd works only with red numbers");
    return this.red.iadd(this, num);
  }
  redSub(num) {
    this.assert(this.red, "redSub works only with red numbers");
    return this.red.sub(this, num);
  }
  redISub(num) {
    this.assert(this.red, "redISub works only with red numbers");
    return this.red.isub(this, num);
  }
  redShl(num) {
    this.assert(this.red, "redShl works only with red numbers");
    return this.red.shl(this, num);
  }
  redMul(num) {
    this.assert(this.red, "redMul works only with red numbers");
    this.red.verify2(this, num);
    return this.red.mul(this, num);
  }
  redIMul(num) {
    this.assert(this.red, "redIMul works only with red numbers");
    this.red.verify2(this, num);
    return this.red.imul(this, num);
  }
  redSqr() {
    this.assert(this.red, "redSqr works only with red numbers");
    this.red.verify1(this);
    return this.red.sqr(this);
  }
  redISqr() {
    this.assert(this.red, "redISqr works only with red numbers");
    this.red.verify1(this);
    return this.red.isqr(this);
  }
  redSqrt() {
    this.assert(this.red, "redSqrt works only with red numbers");
    this.red.verify1(this);
    return this.red.sqrt(this);
  }
  redInvm() {
    this.assert(this.red, "redInvm works only with red numbers");
    this.red.verify1(this);
    return this.red.invm(this);
  }
  redNeg() {
    this.assert(this.red, "redNeg works only with red numbers");
    this.red.verify1(this);
    return this.red.neg(this);
  }
  redPow(num) {
    this.assert(this.red != null && num.red == null, "redPow(normalNum)");
    this.red.verify1(this);
    return this.red.pow(this, num);
  }
  /**
   * Creates a BigNumber from a hexadecimal string.
   *
   * @static
   * @method fromHex
   * @param hex - The hexadecimal string to create a BigNumber from.
   * @param endian - Optional endianness for parsing the hex string.
   * @returns Returns a BigNumber created from the hexadecimal input string.
   *
   * @example
   * const exampleHex = 'a1b2c3';
   * const bigNumber = BigNumber.fromHex(exampleHex);
   */
  static fromHex(hex, endian) {
    let eE = "be";
    if (endian === "little" || endian === "le")
      eE = "le";
    return new _BigNumber(hex, 16, eE);
  }
  /**
   * Converts this BigNumber to a hexadecimal string.
   *
   * @method toHex
   * @param length - The minimum length of the hex string
   * @returns Returns a string representing the hexadecimal value of this BigNumber.
   *
   * @example
   * const bigNumber = new BigNumber(255)
   * const hex = bigNumber.toHex()
   */
  toHex(byteLength = 0) {
    if (this.isZero() && byteLength === 0)
      return "";
    let hexStr = this._getMinimalHex();
    if (hexStr !== "0" && hexStr.length % 2 !== 0) {
      hexStr = "0" + hexStr;
    }
    const minChars = byteLength * 2;
    while (hexStr.length < minChars) {
      hexStr = "0" + hexStr;
    }
    return (this.isNeg() ? "-" : "") + hexStr;
  }
  /**
   * Creates a BigNumber from a JSON-serialized string.
   *
   * @static
   * @method fromJSON
   * @param str - The JSON-serialized string to create a BigNumber from.
   * @returns Returns a BigNumber created from the JSON input string.
   */
  static fromJSON(str) {
    return new _BigNumber(str, 16);
  }
  /**
   * Creates a BigNumber from a number.
   *
   * @static
   * @method fromNumber
   * @param n - The number to create a BigNumber from.
   * @returns Returns a BigNumber equivalent to the input number.
   */
  static fromNumber(n2) {
    return new _BigNumber(n2);
  }
  /**
   * Creates a BigNumber from a string, considering an optional base.
   *
   * @static
   * @method fromString
   * @param str - The string to create a BigNumber from.
   * @param base - The base used for conversion. If not provided, base 10 is assumed.
   * @returns Returns a BigNumber equivalent to the string after conversion from the specified base.
   */
  static fromString(str, base) {
    return new _BigNumber(str, base);
  }
  /**
   * Creates a BigNumber from a signed magnitude number.
   *
   * @static
   * @method fromSm
   * @param bytes - The signed magnitude number to convert to a BigNumber.
   * @param endian - Defines endianess. If not provided, big endian is assumed.
   * @returns Returns a BigNumber equivalent to the signed magnitude number interpreted with specified endianess.
   */
  static fromSm(bytes2, endian = "big") {
    if (bytes2.length === 0)
      return new _BigNumber(0n);
    const beBytes = bytes2.slice();
    if (endian === "little") {
      beBytes.reverse();
    }
    let sign3 = 0;
    if (beBytes.length > 0 && (beBytes[0] & 128) !== 0) {
      sign3 = 1;
      beBytes[0] &= 127;
    }
    let hexStr;
    if (CAN_USE_BUFFER) {
      hexStr = BufferCtor.from(beBytes).toString("hex");
    } else {
      hexStr = "";
      for (const byte of beBytes) {
        hexStr += byte < 16 ? "0" + byte.toString(16) : byte.toString(16);
      }
    }
    const magnitude = hexStr.length === 0 ? 0n : BigInt("0x" + hexStr);
    const r3 = new _BigNumber(0n);
    r3._initializeState(magnitude, sign3);
    return r3;
  }
  /**
   * Converts this BigNumber to a signed magnitude number.
   *
   * @method toSm
   * @param endian - Defines endianess. If not provided, big endian is assumed.
   * @returns Returns an array equivalent to this BigNumber interpreted as a signed magnitude with specified endianess.
   */
  toSm(endian = "big") {
    if (this._magnitude === 0n) {
      return this._sign === 1 ? [128] : [];
    }
    let hex = this._getMinimalHex();
    if (hex.length % 2 !== 0)
      hex = "0" + hex;
    const byteLen = hex.length / 2;
    const bytes2 = new Array(byteLen);
    for (let i = 0, j2 = 0; i < hex.length; i += 2) {
      const high = HEX_CHAR_TO_VALUE[hex.codePointAt(i)];
      const low = HEX_CHAR_TO_VALUE[hex.codePointAt(i + 1)];
      bytes2[j2++] = (high & 15) << 4 | low & 15;
    }
    let result;
    if (this._sign === 1) {
      if ((bytes2[0] & 128) === 0) {
        result = bytes2.slice();
        result[0] |= 128;
      } else {
        result = [128, ...bytes2];
      }
    } else if ((bytes2[0] & 128) === 0) {
      result = bytes2.slice();
    } else {
      result = [0, ...bytes2];
    }
    return endian === "little" ? result.reverse() : result;
  }
  /**
   * Creates a BigNumber from a number representing the "bits" value in a block header.
   *
   * @static
   * @method fromBits
   * @param bits - The number representing the bits value in a block header.
   * @param strict - If true, an error is thrown if the number has negative bit set.
   * @returns Returns a BigNumber equivalent to the "bits" value in a block header.
   * @throws Will throw an error if `strict` is `true` and the number has negative bit set.
   */
  static fromBits(bits, strict = false) {
    const nSize = bits >>> 24;
    const nWordCompact = bits & 8388607;
    const isNegativeFromBit = (bits & 8388608) !== 0;
    if (strict && isNegativeFromBit) {
      throw new Error("negative bit set");
    }
    if (nSize === 0 && nWordCompact === 0) {
      if (isNegativeFromBit && strict)
        throw new Error("negative bit set for zero value");
      return new _BigNumber(0n);
    }
    const bn = new _BigNumber(nWordCompact);
    if (nSize <= 3) {
      bn.iushrn((3 - nSize) * 8);
    } else {
      bn.iushln((nSize - 3) * 8);
    }
    if (isNegativeFromBit) {
      bn.ineg();
    }
    return bn;
  }
  /**
   * Converts this BigNumber to a number representing the "bits" value in a block header.
   *
   * @method toBits
   * @returns Returns a number equivalent to the "bits" value in a block header.
   */
  toBits() {
    this.strip();
    if (this.isZero() && !this.isNeg())
      return 0;
    const isActualNegative = this.isNeg();
    const bnAbs = this.abs();
    let mB = bnAbs.toArray("be");
    let firstNonZeroIdx = 0;
    while (firstNonZeroIdx < mB.length - 1 && mB[firstNonZeroIdx] === 0) {
      firstNonZeroIdx++;
    }
    mB = mB.slice(firstNonZeroIdx);
    let nSize = mB.length;
    if (nSize === 0 && !bnAbs.isZero()) {
      mB = [0];
      nSize = 1;
    }
    if (bnAbs.isZero()) {
      nSize = 0;
      mB = [];
    }
    let nWordNum;
    if (nSize === 0) {
      nWordNum = 0;
    } else if (nSize <= 3) {
      nWordNum = 0;
      for (let i = 0; i < nSize; i++) {
        nWordNum = nWordNum << 8 | mB[i];
      }
    } else {
      nWordNum = mB[0] << 16 | mB[1] << 8 | mB[2];
    }
    if ((nWordNum & 8388608) !== 0 && nSize <= 255) {
      nWordNum >>>= 8;
      nSize++;
    }
    let b5 = nSize << 24 | nWordNum;
    if (isActualNegative)
      b5 |= 8388608;
    return b5 >>> 0;
  }
  /**
   * Creates a BigNumber from the format used in Bitcoin scripts.
   *
   * @static
   * @method fromScriptNum
   * @param num - The number in the format used in Bitcoin scripts.
   * @param requireMinimal - If true, non-minimally encoded values will throw an error.
   * @param maxNumSize - The maximum allowed size for the number.
   * @returns Returns a BigNumber equivalent to the number used in a Bitcoin script.
   */
  static fromScriptNum(num, requireMinimal = false, maxNumSize) {
    if (maxNumSize !== void 0 && num.length > maxNumSize)
      throw new Error("script number overflow");
    if (num.length === 0)
      return new _BigNumber(0n);
    if (requireMinimal) {
      if ((num.at(-1) & 127) === 0) {
        if (num.length <= 1 || (num.at(-2) & 128) === 0) {
          throw new Error("non-minimally encoded script number");
        }
      }
    }
    return _BigNumber.fromSm(num, "little");
  }
  /**
   * Converts this BigNumber to a number in the format used in Bitcoin scripts.
   *
   * @method toScriptNum
   * @returns Returns the equivalent to this BigNumber as a Bitcoin script number.
   */
  toScriptNum() {
    return this.toSm("little");
  }
  /**
   * Compute the multiplicative inverse of the current BigNumber in the modulus field specified by `p`.
   * The multiplicative inverse is a number which when multiplied with the current BigNumber gives '1' in the modulus field.
   *
   * @method _invmp
   * @param p - The `BigNumber` specifying the modulus field.
   * @returns The multiplicative inverse `BigNumber` in the modulus field specified by `p`.
   */
  /**
   * SECURITY NOTE:
   * This implementation avoids variable-time extended Euclidean algorithms
   * to reduce timing side-channel leakage. However, JavaScript BigInt arithmetic
   * does not provide constant-time guarantees. This implementation is suitable
   * for browser and single-tenant environments but is not hardened against
   * high-resolution timing attacks in shared CPU contexts.
  */
  _invmp(p5) {
    this.assert(p5._sign === 0, "p must not be negative for _invmp");
    this.assert(!p5.isZero(), "p must not be zero for _invmp");
    const a4 = this.umod(p5);
    const exp = p5.subn(2);
    if (a4.red !== null) {
      return a4.redPow(exp);
    }
    let result = new _BigNumber(1n);
    let base = a4.clone();
    const e2 = exp.clone();
    while (!e2.isZero()) {
      if (e2.isOdd())
        result = result.mul(base).umod(p5);
      base = base.sqr().umod(p5);
      e2.iushrn(1);
    }
    return result;
  }
  /**
   * Performs multiplication between the BigNumber instance and a given BigNumber.
   * It chooses the multiplication method based on the lengths of the numbers to optimize execution time.
   *
   * @method mulTo
   * @param num - The BigNumber multiply with.
   * @param out - The BigNumber where to store the result.
   * @returns The BigNumber resulting from the multiplication operation.
   */
  mulTo(num, out) {
    out._magnitude = this._magnitude * num._magnitude;
    out._sign = out._magnitude === 0n ? 0 : this._sign ^ num._sign;
    out._nominalWordLength = this.length + num.length;
    out.red = null;
    out.normSign();
    return out;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/Mersenne.js
var Mersenne = class {
  name;
  p;
  k;
  n;
  tmp;
  /**
   * @constructor
   * @param name - An identifier for the Mersenne instance.
   * @param p - A string representation of the pseudo-Mersenne prime, expressed in hexadecimal.
   *
   * @example
   * const mersenne = new Mersenne('M31', '7FFFFFFF');
   */
  constructor(name, p5) {
    this.name = name;
    this.p = new BigNumber(p5, 16);
    this.n = this.p.bitLength();
    this.k = new BigNumber(BigInt(1)).iushln(this.n).isub(this.p);
    this.tmp = this._tmp();
  }
  /**
   * Creates a temporary BigNumber structure for computations,
   * ensuring the appropriate number of words are initially allocated.
   *
   * @method _tmp
   * @returns A BigNumber with scaled size depending on prime magnitude.
   */
  _tmp() {
    const tmp = new BigNumber(BigInt(0));
    const requiredWords = Math.ceil(this.n / BigNumber.wordSize);
    tmp.expand(Math.max(1, requiredWords));
    return tmp;
  }
  /**
   * Reduces an input BigNumber in place, under the assumption that
   * it is less than the square of the pseudo-Mersenne prime.
   *
   * @method ireduce
   * @param num - The BigNumber to be reduced.
   * @returns The reduced BigNumber.
   *
   * @example
   * const reduced = mersenne.ireduce(new BigNumber('2345', 16));
   */
  ireduce(num) {
    const r3 = num;
    let rlen;
    do {
      this.split(r3, this.tmp);
      this.imulK(r3);
      r3.iadd(this.tmp);
      rlen = r3.bitLength();
    } while (rlen > this.n);
    const cmp = rlen < this.n ? -1 : r3.ucmp(this.p);
    if (cmp === 0) {
      r3.words = [0];
    } else if (cmp > 0) {
      r3.isub(this.p);
    }
    r3.strip();
    return r3;
  }
  /**
   * Shifts bits of the input BigNumber to the right, in place,
   * to meet the magnitude of the pseudo-Mersenne prime.
   *
   * @method split
   * @param input - The BigNumber to be shifted (will contain HI part).
   * @param out - The BigNumber to hold the shifted result (LO part).
   *
   * @example
   * mersenne.split(new BigNumber('2345', 16), new BigNumber());
   */
  split(input, out) {
    input.iushrn(this.n, 0, out);
  }
  /**
   * Performs an in-place multiplication of the parameter by constant k.
   *
   * @method imulK
   * @param num - The BigNumber to multiply with k.
   * @returns The result of the multiplication, in BigNumber format.
   *
   * @example
   * const multiplied = mersenne.imulK(new BigNumber('2345', 16));
   */
  imulK(num) {
    return num.imul(this.k);
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/K256.js
var K256 = class extends Mersenne {
  /**
   * Constructor for the K256 class.
   * Creates an instance of K256 using the super constructor from Mersenne.
   *
   * @constructor
   *
   * @example
   * const k256 = new K256();
   */
  constructor() {
    super("k256", "ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f");
  }
  /**
   * Splits a BigNumber into a new BigNumber based on specific computation
   * rules. This method modifies the input and output big numbers.
   *
   * @method split
   * @param input - The BigNumber to be split.
   * @param output - The BigNumber that results from the split.
   *
   * @example
   * const input = new BigNumber(3456);
   * const output = new BigNumber(0);
   * k256.split(input, output);
   */
  split(input, output) {
    const mask = 4194303;
    const inputWords = input.words;
    const inputNominalLength = input.length;
    const outLen = Math.min(inputNominalLength, 9);
    const tempOutputWords = new Array(outLen + (inputNominalLength > 9 ? 1 : 0)).fill(0);
    for (let i = 0; i < outLen; i++) {
      tempOutputWords[i] = inputWords[i];
    }
    let currentOutputWordCount = outLen;
    if (inputNominalLength <= 9) {
      const finalOutputWords2 = new Array(currentOutputWordCount);
      for (let i = 0; i < currentOutputWordCount; ++i)
        finalOutputWords2[i] = tempOutputWords[i];
      output.words = finalOutputWords2;
      input.words = [0];
      return;
    }
    let prev = inputWords[9];
    tempOutputWords[currentOutputWordCount++] = prev & mask;
    const finalOutputWords = new Array(currentOutputWordCount);
    for (let i = 0; i < currentOutputWordCount; ++i)
      finalOutputWords[i] = tempOutputWords[i];
    output.words = finalOutputWords;
    const tempInputNewWords = new Array(Math.max(1, inputNominalLength - 9)).fill(0);
    let currentInputNewWordCount = 0;
    for (let i = 10; i < inputNominalLength; i++) {
      const next = Math.trunc(inputWords[i]);
      if (currentInputNewWordCount < tempInputNewWords.length) {
        tempInputNewWords[currentInputNewWordCount++] = (next & mask) << 4 | prev >>> 22;
      }
      prev = next;
    }
    prev >>>= 22;
    if (currentInputNewWordCount < tempInputNewWords.length) {
      tempInputNewWords[currentInputNewWordCount++] = prev;
    } else if (prev !== 0 && tempInputNewWords.length > 0) {
    }
    const finalInputNewWords = new Array(currentInputNewWordCount);
    for (let i = 0; i < currentInputNewWordCount; ++i)
      finalInputNewWords[i] = tempInputNewWords[i];
    input.words = finalInputNewWords;
  }
  /**
   * Multiplies a BigNumber ('num') with the constant 'K' in-place and returns the result.
   * 'K' is equal to 0x1000003d1 or in decimal representation: [ 64, 977 ].
   *
   * @method imulK
   * @param num - The BigNumber to multiply with K.
   * @returns Returns the mutated BigNumber after multiplication.
   *
   * @example
   * const number = new BigNumber(12345);
   * const result = k256.imulK(number);
   */
  imulK(num) {
    const currentWords = num.words;
    const originalNominalLength = num.length;
    const newNominalLength = originalNominalLength + 2;
    const tempWords = new Array(newNominalLength).fill(0);
    for (let i = 0; i < originalNominalLength; i++) {
      tempWords[i] = currentWords[i];
    }
    let lo = 0;
    for (let i = 0; i < newNominalLength; i++) {
      const w3 = Math.trunc(tempWords[i]);
      lo += w3 * 977;
      tempWords[i] = lo & 67108863;
      lo = w3 * 64 + Math.trunc(lo / 67108864);
    }
    num.words = tempWords;
    return num;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/ReductionContext.js
var ReductionContext = class {
  prime;
  m;
  /**
   * Constructs a new ReductionContext.
   *
   * @constructor
   * @param m - A BigNumber representing the modulus, or 'k256' to create a context for Koblitz curve.
   *
   * @example
   * new ReductionContext(new BigNumber(11));
   * new ReductionContext('k256');
   */
  constructor(m4) {
    if (m4 === "k256") {
      const prime = new K256();
      this.m = prime.p;
      this.prime = prime;
    } else {
      this.assert(m4.gtn(1), "modulus must be greater than 1");
      this.m = m4;
      this.prime = null;
    }
  }
  /**
   * Asserts that given value is truthy. Throws an Error with a provided message
   * if the value is falsy.
   *
   * @private
   * @param val - The value to be checked.
   * @param msg - The error message to be thrown if the value is falsy.
   *
   * @example
   * this.assert(1 < 2, '1 is not less than 2');
   * this.assert(2 < 1, '2 is less than 1'); // throws an Error with message '2 is less than 1'
   */
  assert(val, msg = "Assertion failed") {
    if (!val)
      throw new Error(msg);
  }
  /**
   * Verifies that a BigNumber is positive and red. Throws an error if these
   * conditions are not met.
   *
   * @param a - The BigNumber to be verified.
   *
   * @example
   * this.verify1(new BigNumber(10).toRed());
   * this.verify1(new BigNumber(-10).toRed()); //throws an Error
   * this.verify1(new BigNumber(10)); //throws an Error
   */
  verify1(a4) {
    this.assert(a4.negative === 0, "red works only with positives");
    this.assert(a4.red, "red works only with red numbers");
  }
  /**
   * Verifies that two BigNumbers are both positive and red. Also checks
   * that they have the same reduction context. Throws an error if these
   * conditions are not met.
   *
   * @param a - The first BigNumber to be verified.
   * @param b - The second BigNumber to be verified.
   *
   * @example
   * this.verify2(new BigNumber(10).toRed(this), new BigNumber(20).toRed(this));
   * this.verify2(new BigNumber(-10).toRed(this), new BigNumber(20).toRed(this)); //throws an Error
   * this.verify2(new BigNumber(10).toRed(this), new BigNumber(20)); //throws an Error
   */
  verify2(a4, b5) {
    this.assert((a4.negative | b5.negative) === 0, "red works only with positives");
    this.assert(a4.red != null && a4.red === b5.red, "red works only with red numbers");
  }
  /**
   * Performs an in-place reduction of the given BigNumber by the modulus of the reduction context, 'm'.
   *
   * @method imod
   *
   * @param a - BigNumber to be reduced.
   *
   * @returns Returns the reduced result.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(7));
   * context.imod(new BigNumber(19)); // Returns 5
   */
  imod(a4) {
    if (this.prime != null)
      return this.prime.ireduce(a4).forceRed(this);
    BigNumber.move(a4, a4.umod(this.m).forceRed(this));
    return a4;
  }
  /**
   * Negates a BigNumber in the context of the modulus.
   *
   * @method neg
   *
   * @param a - BigNumber to negate.
   *
   * @returns Returns the negation of 'a' in the reduction context.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(7));
   * context.neg(new BigNumber(3)); // Returns 4
   */
  neg(a4) {
    if (a4.isZero()) {
      return a4.clone();
    }
    return this.m.sub(a4).forceRed(this);
  }
  /**
   * Performs the addition operation on two BigNumbers in the reduction context.
   *
   * @method add
   *
   * @param a - First BigNumber to add.
   * @param b - Second BigNumber to add.
   *
   * @returns Returns the result of 'a + b' in the reduction context.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(5));
   * context.add(new BigNumber(2), new BigNumber(4)); // Returns 1
   */
  add(a4, b5) {
    this.verify2(a4, b5);
    const res = a4.clone();
    res.iadd(b5);
    res.isub(this.m);
    if (res.isNeg()) {
      res.iadd(this.m);
    }
    return res;
  }
  /**
   * Performs an in-place addition operation on two BigNumbers in the reduction context
   * in order to avoid creating a new BigNumber, it modifies the first one with the result.
   *
   * @method iadd
   *
   * @param a - First BigNumber to add.
   * @param b - Second BigNumber to add.
   *
   * @returns Returns the modified 'a' after addition with 'b' in the reduction context.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(5));
   * const a = new BigNumber(2);
   * context.iadd(a, new BigNumber(4)); // Modifies 'a' to be 1
   */
  iadd(a4, b5) {
    this.verify2(a4, b5);
    a4.iadd(b5);
    a4.isub(this.m);
    if (a4.isNeg()) {
      a4.iadd(this.m);
    }
    return a4;
  }
  /**
   * Subtracts one BigNumber from another BigNumber in the reduction context.
   *
   * @method sub
   *
   * @param a - BigNumber to be subtracted from.
   * @param b - BigNumber to subtract.
   *
   * @returns Returns the result of 'a - b' in the reduction context.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(7));
   * context.sub(new BigNumber(3), new BigNumber(2)); // Returns 1
   */
  sub(a4, b5) {
    this.verify2(a4, b5);
    const res = a4.sub(b5);
    if (res.cmpn(0) < 0) {
      res.iadd(this.m);
    }
    return res.forceRed(this);
  }
  /**
   * Performs in-place subtraction of one BigNumber from another in the reduction context,
   * it modifies the first BigNumber with the result.
   *
   * @method isub
   *
   * @param a - BigNumber to be subtracted from.
   * @param b - BigNumber to subtract.
   *
   * @returns Returns the modified 'a' after subtraction of 'b' in the reduction context.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(5));
   * const a = new BigNumber(4);
   * context.isub(a, new BigNumber(2)); // Modifies 'a' to be 2
   */
  isub(a4, b5) {
    this.verify2(a4, b5);
    const res = a4.isub(b5);
    if (res.cmpn(0) < 0) {
      res.iadd(this.m);
    }
    return res;
  }
  /**
   * Performs bitwise shift left operation on a BigNumber in the reduction context.
   *
   * @method shl
   *
   * @param a - BigNumber to perform shift on.
   * @param num - The number of positions to shift.
   *
   * @returns Returns the result of shifting 'a' left by 'num' positions in the reduction context.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(32));
   * context.shl(new BigNumber(4), 2); // Returns 16
   */
  shl(a4, num) {
    this.verify1(a4);
    return this.imod(a4.ushln(num));
  }
  /**
   * Performs in-place multiplication of two BigNumbers in the reduction context,
   * modifying the first BigNumber with the result.
   *
   * @method imul
   *
   * @param a - First BigNumber to multiply.
   * @param b - Second BigNumber to multiply.
   *
   * @returns Returns the modified 'a' after multiplication with 'b' in the reduction context.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(7));
   * const a = new BigNumber(3);
   * context.imul(a, new BigNumber(2)); // Modifies 'a' to be 6
   */
  imul(a4, b5) {
    this.verify2(a4, b5);
    return this.imod(a4.imul(b5));
  }
  /**
   * Multiplies two BigNumbers in the reduction context.
   *
   * @method mul
   *
   * @param a - First BigNumber to multiply.
   * @param b - Second BigNumber to multiply.
   *
   * @returns Returns the result of 'a * b' in the reduction context.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(7));
   * context.mul(new BigNumber(3), new BigNumber(2)); // Returns 6
   */
  mul(a4, b5) {
    this.verify2(a4, b5);
    return this.imod(a4.mul(b5));
  }
  /**
   * Calculates the square of a BigNumber in the reduction context,
   * modifying the original BigNumber with the result.
   *
   * @method isqr
   *
   * @param a - BigNumber to be squared.
   *
   * @returns Returns the squared 'a' in the reduction context.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(7));
   * const a = new BigNumber(3);
   * context.isqr(a); // Modifies 'a' to be 2 (9 % 7 = 2)
   */
  isqr(a4) {
    return this.imul(a4, a4.clone());
  }
  /**
   * Calculates the square of a BigNumber in the reduction context.
   *
   * @method sqr
   *
   * @param a - BigNumber to be squared.
   *
   * @returns Returns the result of 'a^2' in the reduction context.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(7));
   * context.sqr(new BigNumber(3)); // Returns 2 (9 % 7 = 2)
   */
  sqr(a4) {
    return this.mul(a4, a4);
  }
  /**
   * Calculates the square root of a BigNumber in the reduction context.
   *
   * @method sqrt
   *
   * @param a - The BigNumber to calculate the square root of.
   *
   * @returns Returns the square root of 'a' in the reduction context.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(9));
   * context.sqrt(new BigNumber(4)); // Returns 2
   */
  sqrt(a4) {
    if (a4.isZero())
      return a4.clone();
    const mod3 = this.m.andln(3);
    this.assert(mod3 % 2 === 1);
    if (mod3 === 3) {
      const pow = this.m.add(new BigNumber(1)).iushrn(2);
      return this.pow(a4, pow);
    }
    const q3 = this.m.subn(1);
    let s4 = 0;
    while (!q3.isZero() && q3.andln(1) === 0) {
      s4++;
      q3.iushrn(1);
    }
    this.assert(!q3.isZero());
    const one = new BigNumber(1).toRed(this);
    const nOne = one.redNeg();
    const lpow = this.m.subn(1).iushrn(1);
    const zl = this.m.bitLength();
    const z2 = new BigNumber(2 * zl * zl).toRed(this);
    while (this.pow(z2, lpow).cmp(nOne) !== 0) {
      z2.redIAdd(nOne);
    }
    let c4 = this.pow(z2, q3);
    let r3 = this.pow(a4, q3.addn(1).iushrn(1));
    let t3 = this.pow(a4, q3);
    let m4 = s4;
    while (t3.cmp(one) !== 0) {
      let tmp = t3;
      let i = 0;
      for (; tmp.cmp(one) !== 0; i++) {
        tmp = tmp.redSqr();
      }
      this.assert(i < m4);
      const b5 = this.pow(c4, new BigNumber(1).iushln(m4 - i - 1));
      r3 = r3.redMul(b5);
      c4 = b5.redSqr();
      t3 = t3.redMul(c4);
      m4 = i;
    }
    return r3;
  }
  /**
   * Calculates the multiplicative inverse of a BigNumber in the reduction context.
   *
   * @method invm
   *
   * @param a - The BigNumber to find the multiplicative inverse of.
   *
   * @returns Returns the multiplicative inverse of 'a' in the reduction context.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(11));
   * context.invm(new BigNumber(3)); // Returns 4 (3*4 mod 11 = 1)
   */
  invm(a4) {
    const inv = a4._invmp(this.m);
    if (inv.negative !== 0) {
      inv.negative = 0;
      return this.imod(inv).redNeg();
    } else {
      return this.imod(inv);
    }
  }
  /**
   * Raises a BigNumber to a power in the reduction context.
   *
   * @method pow
   *
   * @param a - The BigNumber to be raised to a power.
   * @param num - The power to raise the BigNumber to.
   *
   * @returns Returns the result of 'a' raised to the power of 'num' in the reduction context.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(7));
   * context.pow(new BigNumber(3), new BigNumber(2)); // Returns 2 (3^2 % 7)
   */
  pow(a4, num) {
    this.verify1(a4);
    if (num.isZero())
      return new BigNumber(1).toRed(this);
    let result = new BigNumber(1).toRed(this);
    const base = a4.clone();
    const bits = num.bitLength();
    for (let i = bits - 1; i >= 0; i--) {
      result = this.sqr(result);
      if (num.testn(i)) {
        result = this.mul(result, base);
      }
    }
    return result;
  }
  /**
   * Converts a BigNumber to its equivalent in the reduction context.
   *
   * @method convertTo
   *
   * @param num - The BigNumber to convert to the reduction context.
   *
   * @returns Returns the converted BigNumber compatible with the reduction context.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(7));
   * context.convertTo(new BigNumber(8)); // Returns 1 (8 % 7)
   */
  convertTo(num) {
    const r3 = num.umod(this.m);
    return r3 === num ? r3.clone() : r3;
  }
  /**
   * Converts a BigNumber from reduction context to its regular form.
   *
   * @method convertFrom
   *
   * @param num - The BigNumber to convert from the reduction context.
   *
   * @returns Returns the converted BigNumber in its regular form.
   *
   * @example
   * const context = new ReductionContext(new BigNumber(7));
   * const a = context.convertTo(new BigNumber(8)); // 'a' is now 1 in the reduction context
   * context.convertFrom(a); // Returns 1
   */
  convertFrom(num) {
    const res = num.clone();
    res.red = null;
    return res;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/MontgomoryMethod.js
var MontgomoryMethod = class extends ReductionContext {
  shift;
  r;
  r2;
  rinv;
  minv;
  /**
   * @constructor
   * @param m - The modulus to be used for the Montgomery method reductions.
   */
  constructor(m4) {
    super(m4);
    this.shift = this.m.bitLength();
    if (this.shift % 26 !== 0) {
      this.shift += 26 - this.shift % 26;
    }
    this.r = new BigNumber(1).iushln(this.shift);
    this.r2 = this.imod(this.r.sqr());
    this.rinv = this.r._invmp(this.m);
    this.minv = this.rinv.mul(this.r).isubn(1).div(this.m);
    this.minv = this.minv.umod(this.r);
    this.minv = this.r.sub(this.minv);
  }
  /**
   * Converts a number into the Montgomery domain.
   *
   * @method convertTo
   * @param num - The number to be converted into the Montgomery domain.
   * @returns The result of the conversion into the Montgomery domain.
   *
   * @example
   * const montMethod = new MontgomoryMethod(m);
   * const convertedNum = montMethod.convertTo(num);
   */
  convertTo(num) {
    return this.imod(num.ushln(this.shift));
  }
  /**
   * Converts a number from the Montgomery domain back to the original domain.
   *
   * @method convertFrom
   * @param num - The number to be converted from the Montgomery domain.
   * @returns The result of the conversion from the Montgomery domain.
   *
   * @example
   * const montMethod = new MontgomoryMethod(m);
   * const convertedNum = montMethod.convertFrom(num);
   */
  convertFrom(num) {
    const r3 = this.imod(num.mul(this.rinv));
    r3.red = null;
    return r3;
  }
  /**
   * Performs an in-place multiplication of two numbers in the Montgomery domain.
   *
   * @method imul
   * @param a - The first number to multiply.
   * @param b - The second number to multiply.
   * @returns The result of the in-place multiplication.
   *
   * @example
   * const montMethod = new MontgomoryMethod(m);
   * const product = montMethod.imul(a, b);
   */
  imul(a4, b5) {
    if (a4.isZero() || b5.isZero()) {
      a4.words[0] = 0;
      a4.length = 1;
      return a4;
    }
    const t3 = a4.imul(b5);
    const c4 = t3.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
    const u3 = t3.isub(c4).iushrn(this.shift);
    let res = u3;
    if (u3.cmp(this.m) >= 0) {
      res = u3.isub(this.m);
    } else if (u3.cmpn(0) < 0) {
      res = u3.iadd(this.m);
    }
    return res.forceRed(this);
  }
  /**
   * Performs the multiplication of two numbers in the Montgomery domain.
   *
   * @method mul
   * @param a - The first number to multiply.
   * @param b - The second number to multiply.
   * @returns The result of the multiplication.
   *
   * @example
   * const montMethod = new MontgomoryMethod(m);
   * const product = montMethod.mul(a, b);
   */
  mul(a4, b5) {
    if (a4.isZero() || b5.isZero())
      return new BigNumber(0).forceRed(this);
    const t3 = a4.mul(b5);
    const c4 = t3.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
    const u3 = t3.isub(c4).iushrn(this.shift);
    let res = u3;
    if (u3.cmp(this.m) >= 0) {
      res = u3.isub(this.m);
    } else if (u3.cmpn(0) < 0) {
      res = u3.iadd(this.m);
    }
    return res.forceRed(this);
  }
  /**
   * Calculates the modular multiplicative inverse of a number in the Montgomery domain.
   *
   * @method invm
   * @param a - The number to compute the modular multiplicative inverse of.
   * @returns The modular multiplicative inverse of 'a'.
   *
   * @example
   * const montMethod = new MontgomoryMethod(m);
   * const inverse = montMethod.invm(a);
   */
  invm(a4) {
    const res = this.imod(a4._invmp(this.m).mul(this.r2));
    return res.forceRed(this);
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/BasePoint.js
var BasePoint = class {
  curve;
  type;
  precomputed;
  constructor(type) {
    this.curve = new Curve();
    this.type = type;
    this.precomputed = null;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/JacobianPoint.js
var JacobianPoint = class _JacobianPoint extends BasePoint {
  x;
  y;
  z;
  zOne;
  /**
   * Constructs a new `JacobianPoint` instance.
   *
   * @param x - If `null`, the x-coordinate will default to the curve's defined 'one' constant.
   * If `x` is not a BigNumber, `x` will be converted to a `BigNumber` assuming it is a hex string.
   *
   * @param y - If `null`, the y-coordinate will default to the curve's defined 'one' constant.
   * If `y` is not a BigNumber, `y` will be converted to a `BigNumber` assuming it is a hex string.
   *
   * @param z - If `null`, the z-coordinate will default to 0.
   * If `z` is not a BigNumber, `z` will be converted to a `BigNumber` assuming it is a hex string.
   *
   * @example
   * const pointJ1 = new JacobianPoint(null, null, null); // creates point at infinity
   * const pointJ2 = new JacobianPoint('3', '4', '1'); // creates point (3, 4, 1)
   */
  constructor(x5, y7, z2) {
    super("jacobian");
    if (x5 === null && y7 === null && z2 === null) {
      this.x = this.curve.one;
      this.y = this.curve.one;
      this.z = new BigNumber(0);
    } else {
      if (!BigNumber.isBN(x5)) {
        x5 = new BigNumber(x5, 16);
      }
      this.x = x5;
      if (!BigNumber.isBN(y7)) {
        y7 = new BigNumber(y7, 16);
      }
      this.y = y7;
      if (!BigNumber.isBN(z2)) {
        z2 = new BigNumber(z2, 16);
      }
      this.z = z2;
    }
    if (this.x.red == null) {
      this.x = this.x.toRed(this.curve.red);
    }
    if (this.y.red == null) {
      this.y = this.y.toRed(this.curve.red);
    }
    if (this.z.red == null) {
      this.z = this.z.toRed(this.curve.red);
    }
    this.zOne = this.z === this.curve.one;
    if (this.isInfinity()) {
      this.x = this.curve.one;
      this.y = this.curve.one;
      this.z = new BigNumber(0).toRed(this.curve.red);
      this.zOne = false;
    }
  }
  /**
   * Converts the `JacobianPoint` object instance to standard affine `Point` format and returns `Point` type.
   *
   * @returns The `Point`(affine) object representing the same point as the original `JacobianPoint`.
   *
   * If the initial `JacobianPoint` represents point at infinity, an instance of `Point` at infinity is returned.
   *
   * @example
   * const pointJ = new JacobianPoint('3', '4', '1');
   * const pointP = pointJ.toP();  // The point in affine coordinates.
   */
  toP() {
    if (this.isInfinity()) {
      return new Point(null, null);
    }
    const zinv = this.z.redInvm();
    const zinv2 = zinv.redSqr();
    const ax = this.x.redMul(zinv2);
    const ay = this.y.redMul(zinv2).redMul(zinv);
    return new Point(ax, ay);
  }
  /**
   * Negation operation. It returns the additive inverse of the Jacobian point.
   *
   * @method neg
   * @returns Returns a new Jacobian point as the result of the negation.
   *
   * @example
   * const jp = new JacobianPoint(x, y, z)
   * const result = jp.neg()
   */
  neg() {
    return new _JacobianPoint(this.x, this.y.redNeg(), this.z);
  }
  /**
   * Addition operation in the Jacobian coordinates. It takes a Jacobian point as an argument
   * and returns a new Jacobian point as a result of the addition. In the special cases,
   * when either one of the points is the point at infinity, it will return the other point.
   *
   * @method add
   * @param p - The Jacobian point to be added.
   * @returns Returns a new Jacobian point as the result of the addition.
   *
   * @example
   * const p1 = new JacobianPoint(x1, y1, z1)
   * const p2 = new JacobianPoint(x2, y2, z2)
   * const result = p1.add(p2)
   */
  add(p5) {
    if (this.isInfinity()) {
      return p5;
    }
    if (p5.isInfinity()) {
      return this;
    }
    const pz2 = p5.z.redSqr();
    const z2 = this.z.redSqr();
    const u1 = this.x.redMul(pz2);
    const u22 = p5.x.redMul(z2);
    const s1 = this.y.redMul(pz2.redMul(p5.z));
    const s22 = p5.y.redMul(z2.redMul(this.z));
    const h4 = u1.redSub(u22);
    const r3 = s1.redSub(s22);
    if (h4.cmpn(0) === 0) {
      if (r3.cmpn(0) === 0) {
        return this.dbl();
      } else {
        return new _JacobianPoint(null, null, null);
      }
    }
    const h22 = h4.redSqr();
    const h32 = h22.redMul(h4);
    const v3 = u1.redMul(h22);
    const nx = r3.redSqr().redIAdd(h32).redISub(v3).redISub(v3);
    const ny = r3.redMul(v3.redISub(nx)).redISub(s1.redMul(h32));
    const nz = this.z.redMul(p5.z).redMul(h4);
    return new _JacobianPoint(nx, ny, nz);
  }
  /**
   * Mixed addition operation. This function combines the standard point addition with
   * the transformation from the affine to Jacobian coordinates. It first converts
   * the affine point to Jacobian, and then preforms the addition.
   *
   * @method mixedAdd
   * @param p - The affine point to be added.
   * @returns Returns the result of the mixed addition as a new Jacobian point.
   *
   * @example
   * const jp = new JacobianPoint(x1, y1, z1)
   * const ap = new Point(x2, y2)
   * const result = jp.mixedAdd(ap)
   */
  mixedAdd(p5) {
    if (this.isInfinity()) {
      return p5.toJ();
    }
    if (p5.isInfinity()) {
      return this;
    }
    if (p5.x === null || p5.y === null) {
      throw new Error("Point coordinates cannot be null");
    }
    const z2 = this.z.redSqr();
    const u1 = this.x;
    const u22 = p5.x.redMul(z2);
    const s1 = this.y;
    const s22 = p5.y.redMul(z2).redMul(this.z);
    const h4 = u1.redSub(u22);
    const r3 = s1.redSub(s22);
    if (h4.cmpn(0) === 0) {
      if (r3.cmpn(0) === 0) {
        return this.dbl();
      } else {
        return new _JacobianPoint(null, null, null);
      }
    }
    const h22 = h4.redSqr();
    const h32 = h22.redMul(h4);
    const v3 = u1.redMul(h22);
    const nx = r3.redSqr().redIAdd(h32).redISub(v3).redISub(v3);
    const ny = r3.redMul(v3.redISub(nx)).redISub(s1.redMul(h32));
    const nz = this.z.redMul(h4);
    return new _JacobianPoint(nx, ny, nz);
  }
  /**
   * Multiple doubling operation. It doubles the Jacobian point as many times as the pow parameter specifies. If pow is 0 or the point is the point at infinity, it will return the point itself.
   *
   * @method dblp
   * @param pow - The number of times the point should be doubled.
   * @returns Returns a new Jacobian point as the result of multiple doublings.
   *
   * @example
   * const jp = new JacobianPoint(x, y, z)
   * const result = jp.dblp(3)
   */
  dblp(pow) {
    if (pow === 0) {
      return this;
    }
    if (this.isInfinity()) {
      return this;
    }
    if (pow === void 0) {
      return this.dbl();
    }
    let r3 = this;
    for (let i = 0; i < pow; i++) {
      r3 = r3.dbl();
    }
    return r3;
  }
  /**
   * Point doubling operation in the Jacobian coordinates. A special case is when the point is the point at infinity, in this case, this function will return the point itself.
   *
   * @method dbl
   * @returns Returns a new Jacobian point as the result of the doubling.
   *
   * @example
   * const jp = new JacobianPoint(x, y, z)
   * const result = jp.dbl()
   */
  dbl() {
    if (this.isInfinity()) {
      return this;
    }
    let nx;
    let ny;
    let nz;
    if (this.zOne) {
      const xx = this.x.redSqr();
      const yy = this.y.redSqr();
      const yyyy = yy.redSqr();
      let s4 = this.x.redAdd(yy).redSqr().redISub(xx).redISub(yyyy);
      s4 = s4.redIAdd(s4);
      const m4 = xx.redAdd(xx).redIAdd(xx);
      const t3 = m4.redSqr().redISub(s4).redISub(s4);
      let yyyy8 = yyyy.redIAdd(yyyy);
      yyyy8 = yyyy8.redIAdd(yyyy8);
      yyyy8 = yyyy8.redIAdd(yyyy8);
      nx = t3;
      ny = m4.redMul(s4.redISub(t3)).redISub(yyyy8);
      nz = this.y.redAdd(this.y);
    } else {
      const a4 = this.x.redSqr();
      const b5 = this.y.redSqr();
      const c4 = b5.redSqr();
      let d5 = this.x.redAdd(b5).redSqr().redISub(a4).redISub(c4);
      d5 = d5.redIAdd(d5);
      const e2 = a4.redAdd(a4).redIAdd(a4);
      const f8 = e2.redSqr();
      let c8 = c4.redIAdd(c4);
      c8 = c8.redIAdd(c8);
      c8 = c8.redIAdd(c8);
      nx = f8.redISub(d5).redISub(d5);
      ny = e2.redMul(d5.redISub(nx)).redISub(c8);
      nz = this.y.redMul(this.z);
      nz = nz.redIAdd(nz);
    }
    return new _JacobianPoint(nx, ny, nz);
  }
  /**
   * Equality check operation. It checks whether the affine or Jacobian point is equal to this Jacobian point.
   *
   * @method eq
   * @param p - The affine or Jacobian point to compare with.
   * @returns Returns true if the points are equal, otherwise returns false.
   *
   * @example
   * const jp1 = new JacobianPoint(x1, y1, z1)
   * const jp2 = new JacobianPoint(x2, y2, z2)
   * const areEqual = jp1.eq(jp2)
   */
  eq(p5) {
    if (p5.type === "affine") {
      return this.eq(p5.toJ());
    }
    if (this === p5) {
      return true;
    }
    p5 = p5;
    if (this.isInfinity() && p5.isInfinity()) {
      return true;
    }
    if (this.isInfinity() !== p5.isInfinity()) {
      return false;
    }
    const z2 = this.z.redSqr();
    const pz2 = p5.z.redSqr();
    if (this.x.redMul(pz2).redISub(p5.x.redMul(z2)).cmpn(0) !== 0) {
      return false;
    }
    const z3 = z2.redMul(this.z);
    const pz3 = pz2.redMul(p5.z);
    return this.y.redMul(pz3).redISub(p5.y.redMul(z3)).cmpn(0) === 0;
  }
  /**
   * Equality check operation in relation to an x coordinate of a point in projective coordinates.
   * It checks whether the x coordinate of the Jacobian point is equal to the provided x coordinate
   * of a point in projective coordinates.
   *
   * @method eqXToP
   * @param x - The x coordinate of a point in projective coordinates.
   * @returns Returns true if the x coordinates are equal, otherwise returns false.
   *
   * @example
   * const jp = new JacobianPoint(x1, y1, z1)
   * const isXEqual = jp.eqXToP(x2)
   */
  eqXToP(x5) {
    const zs = this.z.redSqr();
    const rx = x5.toRed(this.curve?.red).redMul(zs);
    if (this.x.cmp(rx) === 0) {
      return true;
    }
    const xc = x5.clone();
    if (this.curve?.redN == null) {
      throw new Error("Curve or redN is not initialized.");
    }
    const t3 = this.curve.redN.redMul(zs);
    while (xc.cmp(this.curve.p) < 0) {
      xc.iadd(this.curve.n);
      if (xc.cmp(this.curve.p) >= 0) {
        return false;
      }
      rx.redIAdd(t3);
      if (this.x.cmp(rx) === 0) {
        return true;
      }
    }
    return false;
  }
  /**
   * Returns the string representation of the JacobianPoint instance.
   * @method inspect
   * @returns Returns the string description of the JacobianPoint. If the JacobianPoint represents a point at infinity, the return value of this function is '<EC JPoint Infinity>'. For a normal point, it returns the string description format as '<EC JPoint x: x-coordinate y: y-coordinate z: z-coordinate>'.
   *
   * @example
   * const point = new JacobianPoint('5', '6', '1');
   * console.log(point.inspect()); // Output: '<EC JPoint x: 5 y: 6 z: 1>'
   */
  inspect() {
    if (this.isInfinity()) {
      return "<EC JPoint Infinity>";
    }
    return "<EC JPoint x: " + this.x.toString(16, 2) + " y: " + this.y.toString(16, 2) + " z: " + this.z.toString(16, 2) + ">";
  }
  /**
   * Checks whether the JacobianPoint instance represents a point at infinity.
   * @method isInfinity
   * @returns Returns true if the JacobianPoint's z-coordinate equals to zero (which represents the point at infinity in Jacobian coordinates). Returns false otherwise.
   *
   * @example
   * const point = new JacobianPoint('5', '6', '0');
   * console.log(point.isInfinity()); // Output: true
   */
  isInfinity() {
    return this.z.cmpn(0) === 0;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/utils.js
var utils_exports = {};
__export(utils_exports, {
  Reader: () => Reader,
  ReaderUint8Array: () => ReaderUint8Array,
  Writer: () => Writer,
  WriterUint8Array: () => WriterUint8Array,
  base64ToArray: () => base64ToArray,
  constantTimeEquals: () => constantTimeEquals,
  encode: () => encode,
  fromBase58: () => fromBase58,
  fromBase58Check: () => fromBase58Check,
  minimallyEncode: () => minimallyEncode,
  toArray: () => toArray2,
  toBase58: () => toBase58,
  toBase58Check: () => toBase58Check,
  toBase64: () => toBase64,
  toHex: () => toHex,
  toUTF8: () => toUTF8,
  toUint8Array: () => toUint8Array,
  verifyNotNull: () => verifyNotNull,
  zero2: () => zero2
});

// node_modules/@bsv/sdk/dist/esm/src/primitives/Hash.js
var Hash_exports = {};
__export(Hash_exports, {
  RIPEMD160: () => RIPEMD160,
  SHA1: () => SHA1,
  SHA1HMAC: () => SHA1HMAC,
  SHA256: () => SHA256,
  SHA256HMAC: () => SHA256HMAC,
  SHA512: () => SHA512,
  SHA512HMAC: () => SHA512HMAC,
  hash160: () => hash160,
  hash256: () => hash256,
  htonl: () => htonl,
  pbkdf2: () => pbkdf2,
  realHtonl: () => realHtonl,
  ripemd160: () => ripemd160,
  sha1: () => sha1,
  sha256: () => sha256,
  sha256hmac: () => sha256hmac,
  sha512: () => sha512,
  sha512hmac: () => sha512hmac,
  swapBytes32: () => swapBytes32,
  toArray: () => toArray
});

// node_modules/@bsv/sdk/dist/esm/src/primitives/hex.js
var PURE_HEX_REGEX = /^[0-9a-fA-F]*$/;
function assertValidHex(msg) {
  if (typeof msg !== "string") {
    throw new TypeError("Invalid hex string");
  }
  if (msg.length === 0)
    return;
  if (!PURE_HEX_REGEX.test(msg)) {
    throw new Error("Invalid hex string");
  }
}
function normalizeHex(msg) {
  assertValidHex(msg);
  if (msg.length === 0)
    return "";
  let normalized = msg.toLowerCase();
  if (normalized.length % 2 !== 0) {
    normalized = "0" + normalized;
  }
  return normalized;
}

// node_modules/@bsv/sdk/dist/esm/src/primitives/Hash.js
var assert = (expression, message = "Hash assertion failed") => {
  if (!expression) {
    throw new Error(message);
  }
};
var BaseHash = class {
  pending;
  pendingTotal;
  blockSize;
  outSize;
  endian;
  _delta8;
  _delta32;
  padLength;
  hmacStrength;
  constructor(blockSize, outSize, hmacStrength, padLength) {
    this.pending = null;
    this.pendingTotal = 0;
    this.blockSize = blockSize;
    this.outSize = outSize;
    this.hmacStrength = hmacStrength;
    this.padLength = padLength / 8;
    this.endian = "big";
    this._delta8 = this.blockSize / 8;
    this._delta32 = this.blockSize / 32;
  }
  _update(msg, start) {
    throw new Error("Not implemented");
  }
  _digest() {
    throw new Error("Not implemented");
  }
  _digestHex() {
    throw new Error("Not implemented");
  }
  /**
   * Converts the input message into an array, pads it, and joins into 32bit blocks.
   * If there is enough data, it tries updating the hash computation.
   *
   * @method update
   * @param msg - The message segment to include in the hashing computation.
   * @param enc - The encoding of the message. If 'hex', the string will be treated as such, 'utf8' otherwise.
   *
   * @returns Returns the instance of the object for chaining.
   *
   * @example
   * sha256.update('Hello World', 'utf8');
   */
  update(msg, enc) {
    msg = toArray(msg, enc);
    if (this.pending == null) {
      this.pending = msg;
    } else {
      this.pending = this.pending.concat(msg);
    }
    this.pendingTotal += msg.length;
    if (this.pending.length >= this._delta8) {
      msg = this.pending;
      const r3 = msg.length % this._delta8;
      this.pending = msg.slice(msg.length - r3, msg.length);
      if (this.pending.length === 0) {
        this.pending = null;
      }
      msg = join32(msg, 0, msg.length - r3, this.endian);
      for (let i = 0; i < msg.length; i += this._delta32) {
        this._update(msg, i);
      }
    }
    return this;
  }
  /**
   * Finalizes the hash computation and returns the hash value/result.
   *
   * @method digest
   *
   * @returns Returns the final hash value.
   *
   * @example
   * const hash = sha256.digest();
   */
  digest() {
    this.update(this._pad());
    assert(this.pending === null);
    return this._digest();
  }
  /**
   * Finalizes the hash computation and returns the hash value/result as a hex string.
   *
   * @method digest
   *
   * @returns Returns the final hash value as a hex string.
   *
   * @example
   * const hash = sha256.digestHex();
   */
  digestHex() {
    this.update(this._pad());
    assert(this.pending === null);
    return this._digestHex();
  }
  /**
   * [Private Method] Used internally to prepare the padding for the final stage of the hash computation.
   *
   * @method _pad
   * @private
   *
   * @returns Returns an array denoting the padding.
   */
  _pad() {
    const len = this.pendingTotal;
    if (!Number.isSafeInteger(len) || len < 0) {
      throw new Error("Message too long for this hash function");
    }
    const bytes2 = this._delta8;
    const k4 = bytes2 - (len + this.padLength) % bytes2;
    const res = new Array(k4 + this.padLength);
    res[0] = 128;
    let i;
    for (i = 1; i < k4; i++) {
      res[i] = 0;
    }
    const lengthBytes = this.padLength;
    const maxBits = 1n << BigInt(lengthBytes * 8);
    let totalBits = BigInt(len) * 8n;
    if (totalBits >= maxBits) {
      throw new Error("Message too long for this hash function");
    }
    if (this.endian === "big") {
      const lenArray = new Array(lengthBytes);
      for (let b5 = lengthBytes - 1; b5 >= 0; b5--) {
        lenArray[b5] = Number(totalBits & 0xffn);
        totalBits >>= 8n;
      }
      for (let b5 = 0; b5 < lengthBytes; b5++) {
        res[i++] = lenArray[b5];
      }
    } else {
      for (let b5 = 0; b5 < lengthBytes; b5++) {
        res[i++] = Number(totalBits & 0xffn);
        totalBits >>= 8n;
      }
    }
    return res;
  }
};
function isSurrogatePair(msg, i) {
  if ((msg.charCodeAt(i) & 64512) !== 55296) {
    return false;
  }
  if (i < 0 || i + 1 >= msg.length) {
    return false;
  }
  return (msg.charCodeAt(i + 1) & 64512) === 56320;
}
function appendUtf8CodeUnit(msg, i, out) {
  let c4 = msg.charCodeAt(i);
  if (c4 < 128) {
    out.push(c4);
    return i;
  }
  if (c4 < 2048) {
    out.push(c4 >> 6 | 192, c4 & 63 | 128);
    return i;
  }
  if (isSurrogatePair(msg, i)) {
    c4 = 65536 + ((c4 & 1023) << 10) + (msg.charCodeAt(i + 1) & 1023);
    out.push(c4 >> 18 | 240, c4 >> 12 & 63 | 128, c4 >> 6 & 63 | 128, c4 & 63 | 128);
    return i + 1;
  }
  out.push(c4 >> 12 | 224, c4 >> 6 & 63 | 128, c4 & 63 | 128);
  return i;
}
function utf8StringToArray(msg) {
  const res = [];
  let i = 0;
  while (i < msg.length) {
    const lastConsumed = appendUtf8CodeUnit(msg, i, res);
    i = lastConsumed + 1;
  }
  return res;
}
function hexStringToArray(msg) {
  assertValidHex(msg);
  const normalized = normalizeHex(msg);
  const res = [];
  for (let i = 0; i < normalized.length; i += 2) {
    res.push(Number.parseInt(normalized[i] + normalized[i + 1], 16));
  }
  return res;
}
function numberArrayToByteArray(msg) {
  const res = [];
  for (let i = 0; i < msg.length; i++) {
    res[i] = Math.trunc(msg[i]);
  }
  return res;
}
function toArray(msg, enc) {
  if (Array.isArray(msg)) {
    return msg.slice();
  }
  if (!msg) {
    return [];
  }
  if (typeof msg === "string") {
    return enc === "hex" ? hexStringToArray(msg) : utf8StringToArray(msg);
  }
  return numberArrayToByteArray(msg);
}
function htonl(w3) {
  return swapBytes32(w3);
}
function toHex32(msg, endian) {
  let res = "";
  for (let w3 of msg) {
    if (endian === "little") {
      w3 = htonl(w3);
    }
    res += zero8(w3.toString(16));
  }
  return res;
}
function zero8(word) {
  if (word.length === 7) {
    return "0" + word;
  } else if (word.length === 6) {
    return "00" + word;
  } else if (word.length === 5) {
    return "000" + word;
  } else if (word.length === 4) {
    return "0000" + word;
  } else if (word.length === 3) {
    return "00000" + word;
  } else if (word.length === 2) {
    return "000000" + word;
  } else if (word.length === 1) {
    return "0000000" + word;
  } else {
    return word;
  }
}
var BufferCtor2 = typeof globalThis === "undefined" ? void 0 : globalThis.Buffer;
var CAN_USE_BUFFER2 = BufferCtor2 != null && typeof BufferCtor2.from === "function";
var HEX_DIGITS = "0123456789abcdef";
var HEX_BYTE_STRINGS = new Array(256);
for (let i = 0; i < HEX_BYTE_STRINGS.length; i++) {
  HEX_BYTE_STRINGS[i] = HEX_DIGITS[i >> 4 & 15] + HEX_DIGITS[i & 15];
}
function bytesToHex(data) {
  if (CAN_USE_BUFFER2) {
    return BufferCtor2.from(data).toString("hex");
  }
  const out = new Array(data.length);
  for (let i = 0; i < data.length; i++)
    out[i] = HEX_BYTE_STRINGS[data[i]];
  return out.join("");
}
var NODE_CRYPTO = (() => {
  const processLike = typeof globalThis === "undefined" ? void 0 : globalThis.process;
  const getBuiltinModule = processLike?.getBuiltinModule;
  if (typeof getBuiltinModule === "function") {
    try {
      const crypto = getBuiltinModule.call(processLike, "node:crypto");
      if (crypto != null)
        return crypto;
    } catch {
    }
  }
  try {
    if (typeof __require === "function") {
      return __require("node:crypto");
    }
  } catch {
  }
  return void 0;
})();
function toHashBytes(msg, enc) {
  if (msg instanceof Uint8Array) {
    return msg;
  }
  if (Array.isArray(msg)) {
    return new Uint8Array(msg);
  }
  return Uint8Array.from(toArray(msg, enc));
}
function toHashKeyBytes(key) {
  return typeof key === "string" ? toHashBytes(key, "hex") : toHashBytes(key);
}
function updateNativeOrFallback(native, fallback, data) {
  if (native != null) {
    native.update(data);
  } else if (fallback != null) {
    fallback.update(data);
  }
}
function digestNativeOrFallback(native, fallback) {
  if (native != null)
    return Array.from(native.digest());
  if (fallback != null)
    return Array.from(fallback.digest());
  return [];
}
function digestHexNativeOrFallback(native, fallback) {
  if (native != null)
    return native.digest("hex");
  if (fallback != null)
    return bytesToHex(fallback.digest());
  return "";
}
function createNodeHash(algorithm) {
  const createHash = NODE_CRYPTO?.createHash;
  if (typeof createHash !== "function")
    return void 0;
  try {
    return createHash(algorithm);
  } catch {
    return void 0;
  }
}
function createNodeHmac(algorithm, keyBytes) {
  const createHmac = NODE_CRYPTO?.createHmac;
  if (typeof createHmac !== "function")
    return void 0;
  try {
    return createHmac(algorithm, keyBytes);
  } catch {
    return void 0;
  }
}
function digestWithNodeHash(algorithm, msg, enc) {
  const hash = createNodeHash(algorithm);
  if (hash == null)
    return void 0;
  hash.update(toHashBytes(msg, enc));
  return hash.digest();
}
function digestWithNodeHmac(algorithm, key, msg, enc) {
  const hmac2 = createNodeHmac(algorithm, toHashKeyBytes(key));
  if (hmac2 == null)
    return void 0;
  hmac2.update(toHashBytes(msg, enc));
  return hmac2.digest();
}
function join32(msg, start, end, endian) {
  const len = end - start;
  assert(len % 4 === 0);
  const res = new Array(len / 4);
  for (let i = 0, k4 = start; i < res.length; i++, k4 += 4) {
    let w3;
    if (endian === "big") {
      w3 = msg[k4] << 24 | msg[k4 + 1] << 16 | msg[k4 + 2] << 8 | msg[k4 + 3];
    } else {
      w3 = msg[k4 + 3] << 24 | msg[k4 + 2] << 16 | msg[k4 + 1] << 8 | msg[k4];
    }
    res[i] = w3 >>> 0;
  }
  return res;
}
function split32(msg, endian) {
  const res = new Array(msg.length * 4);
  for (let i = 0, k4 = 0; i < msg.length; i++, k4 += 4) {
    const m4 = msg[i];
    if (endian === "big") {
      res[k4] = m4 >>> 24;
      res[k4 + 1] = m4 >>> 16 & 255;
      res[k4 + 2] = m4 >>> 8 & 255;
      res[k4 + 3] = m4 & 255;
    } else {
      res[k4 + 3] = m4 >>> 24;
      res[k4 + 2] = m4 >>> 16 & 255;
      res[k4 + 1] = m4 >>> 8 & 255;
      res[k4] = m4 & 255;
    }
  }
  return res;
}
function rotr32(w3, b5) {
  return w3 >>> b5 | w3 << 32 - b5;
}
function rotl32(w3, b5) {
  return w3 << b5 | w3 >>> 32 - b5;
}
function sum32(a4, b5) {
  return a4 + b5 >>> 0;
}
function SUM32_3(a4, b5, c4) {
  return a4 + b5 + c4 >>> 0;
}
function SUM32_4(a4, b5, c4, d5) {
  return a4 + b5 + c4 + d5 >>> 0;
}
function SUM32_5(a4, b5, c4, d5, e2) {
  return a4 + b5 + c4 + d5 + e2 >>> 0;
}
function FT_1(s4, x5, y7, z2) {
  if (s4 === 0) {
    return ch32(x5, y7, z2);
  }
  if (s4 === 1 || s4 === 3) {
    return p32(x5, y7, z2);
  }
  if (s4 === 2) {
    return maj32(x5, y7, z2);
  }
  return 0;
}
function ch32(x5, y7, z2) {
  return x5 & y7 ^ ~x5 & z2;
}
function maj32(x5, y7, z2) {
  return x5 & y7 ^ x5 & z2 ^ y7 & z2;
}
function p32(x5, y7, z2) {
  return x5 ^ y7 ^ z2;
}
function S0_256(x5) {
  return rotr32(x5, 2) ^ rotr32(x5, 13) ^ rotr32(x5, 22);
}
function S1_256(x5) {
  return rotr32(x5, 6) ^ rotr32(x5, 11) ^ rotr32(x5, 25);
}
function G0_256(x5) {
  return rotr32(x5, 7) ^ rotr32(x5, 18) ^ x5 >>> 3;
}
function G1_256(x5) {
  return rotr32(x5, 17) ^ rotr32(x5, 19) ^ x5 >>> 10;
}
var r = [
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  7,
  4,
  13,
  1,
  10,
  6,
  15,
  3,
  12,
  0,
  9,
  5,
  2,
  14,
  11,
  8,
  3,
  10,
  14,
  4,
  9,
  15,
  8,
  1,
  2,
  7,
  0,
  6,
  13,
  11,
  5,
  12,
  1,
  9,
  11,
  10,
  0,
  8,
  12,
  4,
  13,
  3,
  7,
  15,
  14,
  5,
  6,
  2,
  4,
  0,
  5,
  9,
  7,
  12,
  2,
  10,
  14,
  1,
  3,
  8,
  11,
  6,
  15,
  13
];
var rh = [
  5,
  14,
  7,
  0,
  9,
  2,
  11,
  4,
  13,
  6,
  15,
  8,
  1,
  10,
  3,
  12,
  6,
  11,
  3,
  7,
  0,
  13,
  5,
  10,
  14,
  15,
  8,
  12,
  4,
  9,
  1,
  2,
  15,
  5,
  1,
  3,
  7,
  14,
  6,
  9,
  11,
  8,
  12,
  2,
  10,
  0,
  4,
  13,
  8,
  6,
  4,
  1,
  3,
  11,
  15,
  0,
  5,
  12,
  2,
  13,
  9,
  7,
  10,
  14,
  12,
  15,
  10,
  4,
  1,
  5,
  8,
  7,
  6,
  2,
  13,
  14,
  0,
  3,
  9,
  11
];
var s = [
  11,
  14,
  15,
  12,
  5,
  8,
  7,
  9,
  11,
  13,
  14,
  15,
  6,
  7,
  9,
  8,
  7,
  6,
  8,
  13,
  11,
  9,
  7,
  15,
  7,
  12,
  15,
  9,
  11,
  7,
  13,
  12,
  11,
  13,
  6,
  7,
  14,
  9,
  13,
  15,
  14,
  8,
  13,
  6,
  5,
  12,
  7,
  5,
  11,
  12,
  14,
  15,
  14,
  15,
  9,
  8,
  9,
  14,
  5,
  6,
  8,
  6,
  5,
  12,
  9,
  15,
  5,
  11,
  6,
  8,
  13,
  12,
  5,
  12,
  13,
  14,
  11,
  8,
  5,
  6
];
var sh = [
  8,
  9,
  9,
  11,
  13,
  15,
  15,
  5,
  7,
  7,
  8,
  11,
  14,
  14,
  12,
  6,
  9,
  13,
  15,
  7,
  12,
  8,
  9,
  11,
  7,
  7,
  12,
  7,
  6,
  15,
  13,
  11,
  9,
  7,
  15,
  11,
  8,
  6,
  6,
  14,
  12,
  13,
  5,
  14,
  13,
  13,
  7,
  5,
  15,
  5,
  8,
  11,
  14,
  14,
  6,
  14,
  6,
  9,
  12,
  9,
  12,
  5,
  15,
  8,
  8,
  5,
  12,
  9,
  12,
  5,
  14,
  6,
  8,
  13,
  6,
  5,
  15,
  13,
  11,
  11
];
function f(j2, x5, y7, z2) {
  if (j2 <= 15) {
    return x5 ^ y7 ^ z2;
  } else if (j2 <= 31) {
    return x5 & y7 | ~x5 & z2;
  } else if (j2 <= 47) {
    return (x5 | ~y7) ^ z2;
  } else if (j2 <= 63) {
    return x5 & z2 | y7 & ~z2;
  } else {
    return x5 ^ (y7 | ~z2);
  }
}
function K(j2) {
  if (j2 <= 15) {
    return 0;
  } else if (j2 <= 31) {
    return 1518500249;
  } else if (j2 <= 47) {
    return 1859775393;
  } else if (j2 <= 63) {
    return 2400959708;
  } else {
    return 2840853838;
  }
}
function Kh(j2) {
  if (j2 <= 15) {
    return 1352829926;
  } else if (j2 <= 31) {
    return 1548603684;
  } else if (j2 <= 47) {
    return 1836072691;
  } else if (j2 <= 63) {
    return 2053994217;
  } else {
    return 0;
  }
}
var RIPEMD160 = class extends BaseHash {
  h;
  constructor() {
    super(512, 160, 192, 64);
    this.endian = "little";
    this.h = [1732584193, 4023233417, 2562383102, 271733878, 3285377520];
    this.endian = "little";
  }
  _update(msg, start) {
    let A7 = this.h[0];
    let B5 = this.h[1];
    let C2 = this.h[2];
    let D = this.h[3];
    let E3 = this.h[4];
    let Ah = A7;
    let Bh = B5;
    let Ch = C2;
    let Dh = D;
    let Eh = E3;
    let T2;
    for (let j2 = 0; j2 < 80; j2++) {
      T2 = sum32(rotl32(SUM32_4(A7, f(j2, B5, C2, D), msg[r[j2] + start], K(j2)), s[j2]), E3);
      A7 = E3;
      E3 = D;
      D = rotl32(C2, 10);
      C2 = B5;
      B5 = T2;
      T2 = sum32(rotl32(SUM32_4(Ah, f(79 - j2, Bh, Ch, Dh), msg[rh[j2] + start], Kh(j2)), sh[j2]), Eh);
      Ah = Eh;
      Eh = Dh;
      Dh = rotl32(Ch, 10);
      Ch = Bh;
      Bh = T2;
    }
    T2 = SUM32_3(this.h[1], C2, Dh);
    this.h[1] = SUM32_3(this.h[2], D, Eh);
    this.h[2] = SUM32_3(this.h[3], E3, Ah);
    this.h[3] = SUM32_3(this.h[4], A7, Bh);
    this.h[4] = SUM32_3(this.h[0], B5, Ch);
    this.h[0] = T2;
  }
  _digest() {
    return split32(this.h, "little");
  }
  _digestHex() {
    return toHex32(this.h, "little");
  }
};
var SHA256 = class {
  h;
  native;
  constructor() {
    this.native = createNodeHash("sha256");
    if (this.native == null) {
      this.h = new FastSHA256();
    }
  }
  update(msg, enc) {
    updateNativeOrFallback(this.native, this.h, toHashBytes(msg, enc));
    return this;
  }
  digest() {
    return digestNativeOrFallback(this.native, this.h);
  }
  digestHex() {
    return digestHexNativeOrFallback(this.native, this.h);
  }
};
var SHA1 = class extends BaseHash {
  h;
  W;
  k;
  constructor() {
    super(512, 160, 80, 64);
    this.k = [1518500249, 1859775393, 2400959708, 3395469782];
    this.h = [1732584193, 4023233417, 2562383102, 271733878, 3285377520];
    this.W = new Array(80);
  }
  _update(msg, start) {
    const W = this.W;
    if (start === void 0) {
      start = 0;
    }
    let i;
    for (i = 0; i < 16; i++) {
      W[i] = msg[start + i];
    }
    for (; i < W.length; i++) {
      W[i] = rotl32(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1);
    }
    let a4 = this.h[0];
    let b5 = this.h[1];
    let c4 = this.h[2];
    let d5 = this.h[3];
    let e2 = this.h[4];
    for (i = 0; i < W.length; i++) {
      const s4 = Math.trunc(i / 20);
      const t3 = SUM32_5(rotl32(a4, 5), FT_1(s4, b5, c4, d5), e2, W[i], this.k[s4]);
      e2 = d5;
      d5 = c4;
      c4 = rotl32(b5, 30);
      b5 = a4;
      a4 = t3;
    }
    this.h[0] = sum32(this.h[0], a4);
    this.h[1] = sum32(this.h[1], b5);
    this.h[2] = sum32(this.h[2], c4);
    this.h[3] = sum32(this.h[3], d5);
    this.h[4] = sum32(this.h[4], e2);
  }
  _digest() {
    return split32(this.h, "big");
  }
  _digestHex() {
    return toHex32(this.h, "big");
  }
};
var SHA512 = class {
  h;
  native;
  constructor() {
    this.native = createNodeHash("sha512");
    if (this.native == null) {
      this.h = new FastSHA512();
    }
  }
  update(msg, enc) {
    updateNativeOrFallback(this.native, this.h, toHashBytes(msg, enc));
    return this;
  }
  digest() {
    return digestNativeOrFallback(this.native, this.h);
  }
  digestHex() {
    return digestHexNativeOrFallback(this.native, this.h);
  }
};
var SHA256HMAC = class {
  h;
  native;
  blockSize = 64;
  outSize = 32;
  /**
   * The constructor for the `SHA256HMAC` class.
   *
   * It initializes the `SHA256HMAC` object and sets up the inner and outer padded keys.
   * If the key size is larger than the blockSize, it is digested using SHA-256.
   * If the key size is less than the blockSize, it is padded with zeroes.
   *
   * @constructor
   * @param key - The key to use to create the HMAC. Can be a number array or a string in hexadecimal format.
   *
   * @example
   * const myHMAC = new SHA256HMAC('deadbeef');
   */
  constructor(key) {
    const k4 = toHashKeyBytes(key);
    this.native = createNodeHmac("sha256", k4);
    if (this.native == null) {
      this.h = new HMAC(sha256Fast, k4);
    }
  }
  /**
   * Updates the `SHA256HMAC` object with part of the message to be hashed.
   *
   * @method update
   * @param msg - Part of the message to hash. Can be a number array or a string.
   * @param enc - If 'hex', then the input is encoded as hexadecimal. If undefined or not 'hex', then no encoding is performed.
   * @returns Returns the instance of `SHA256HMAC` for chaining calls.
   *
   * @example
   * myHMAC.update('deadbeef', 'hex');
   */
  update(msg, enc) {
    updateNativeOrFallback(this.native, this.h, toHashBytes(msg, enc));
    return this;
  }
  /**
   * Finalizes the HMAC computation and returns the resultant hash.
   *
   * @method digest
   * @returns Returns the digest of the hashed data. Can be a number array or a string.
   *
   * @example
   * let hashedMessage = myHMAC.digest();
   */
  digest() {
    return digestNativeOrFallback(this.native, this.h);
  }
  /**
   * Finalizes the HMAC computation and returns the resultant hash as a hex string.
   *
   * @method digest
   * @returns Returns the digest of the hashed data as a hex string
   *
   * @example
   * let hashedMessage = myHMAC.digestHex();
   */
  digestHex() {
    return digestHexNativeOrFallback(this.native, this.h);
  }
};
var SHA1HMAC = class {
  inner;
  outer;
  blockSize = 64;
  constructor(key) {
    key = toArray(key, "hex");
    if (key.length > this.blockSize) {
      key = new SHA1().update(key).digest();
    }
    let i;
    for (i = key.length; i < this.blockSize; i++) {
      key.push(0);
    }
    for (i = 0; i < key.length; i++) {
      key[i] ^= 54;
    }
    this.inner = new SHA1().update(key);
    for (i = 0; i < key.length; i++) {
      key[i] ^= 106;
    }
    this.outer = new SHA1().update(key);
  }
  update(msg, enc) {
    this.inner.update(msg, enc);
    return this;
  }
  digest() {
    this.outer.update(this.inner.digest());
    return this.outer.digest();
  }
  digestHex() {
    this.outer.update(this.inner.digest());
    return this.outer.digestHex();
  }
};
var SHA512HMAC = class {
  h;
  native;
  blockSize = 128;
  outSize = 32;
  /**
   * The constructor for the `SHA512HMAC` class.
   *
   * It initializes the `SHA512HMAC` object and sets up the inner and outer padded keys.
   * If the key size is larger than the blockSize, it is digested using SHA-512.
   * If the key size is less than the blockSize, it is padded with zeroes.
   *
   * @constructor
   * @param key - The key to use to create the HMAC. Can be a number array or a string in hexadecimal format.
   *
   * @example
   * const myHMAC = new SHA512HMAC('deadbeef');
   */
  constructor(key) {
    const k4 = toHashKeyBytes(key);
    this.native = createNodeHmac("sha512", k4);
    if (this.native == null) {
      this.h = new HMAC(sha512Fast, k4);
    }
  }
  /**
   * Updates the `SHA512HMAC` object with part of the message to be hashed.
   *
   * @method update
   * @param msg - Part of the message to hash. Can be a number array or a string.
   * @param enc - If 'hex', then the input is encoded as hexadecimal. If undefined or not 'hex', then no encoding is performed.
   * @returns Returns the instance of `SHA512HMAC` for chaining calls.
   *
   * @example
   * myHMAC.update('deadbeef', 'hex');
   */
  update(msg, enc) {
    updateNativeOrFallback(this.native, this.h, toHashBytes(msg, enc));
    return this;
  }
  /**
   * Finalizes the HMAC computation and returns the resultant hash.
   *
   * @method digest
   * @returns Returns the digest of the hashed data as a number array.
   *
   * @example
   * let hashedMessage = myHMAC.digest();
   */
  digest() {
    return digestNativeOrFallback(this.native, this.h);
  }
  /**
   * Finalizes the HMAC computation and returns the resultant hash as a hex string.
   *
   * @method digest
   * @returns Returns the digest of the hashed data as a hex string
   *
   * @example
   * let hashedMessage = myHMAC.digestHex();
   */
  digestHex() {
    return digestHexNativeOrFallback(this.native, this.h);
  }
};
function sha256Bytes(msg, enc) {
  const native = digestWithNodeHash("sha256", msg, enc);
  if (native != null)
    return native;
  return new FastSHA256().update(toHashBytes(msg, enc)).digest();
}
function sha512Bytes(msg, enc) {
  const native = digestWithNodeHash("sha512", msg, enc);
  if (native != null)
    return native;
  return new FastSHA512().update(toHashBytes(msg, enc)).digest();
}
function ripemd160Bytes(msg, enc) {
  return digestWithNodeHash("ripemd160", msg, enc);
}
var ripemd160 = (msg, enc) => {
  const native = ripemd160Bytes(msg, enc);
  if (native != null)
    return Array.from(native);
  return new RIPEMD160().update(msg, enc).digest();
};
var sha1 = (msg, enc) => {
  return new SHA1().update(msg, enc).digest();
};
var sha256 = (msg, enc) => {
  return Array.from(sha256Bytes(msg, enc));
};
var sha512 = (msg, enc) => {
  return Array.from(sha512Bytes(msg, enc));
};
var hash256 = (msg, enc) => {
  return Array.from(sha256Bytes(sha256Bytes(msg, enc)));
};
var hash160 = (msg, enc) => {
  const first = sha256Bytes(msg, enc);
  const native = ripemd160Bytes(first);
  if (native != null)
    return Array.from(native);
  return new RIPEMD160().update(first).digest();
};
var sha256hmac = (key, msg, enc) => {
  const native = digestWithNodeHmac("sha256", key, msg, enc);
  if (native != null)
    return Array.from(native);
  return new SHA256HMAC(key).update(msg, enc).digest();
};
var sha512hmac = (key, msg, enc) => {
  const native = digestWithNodeHmac("sha512", key, msg, enc);
  if (native != null)
    return Array.from(native);
  return new SHA512HMAC(key).update(msg, enc).digest();
};
function isBytes(a4) {
  return a4 instanceof Uint8Array || ArrayBuffer.isView(a4) && a4.constructor.name === "Uint8Array";
}
function anumber(n2) {
  if (!Number.isSafeInteger(n2) || n2 < 0) {
    throw new Error(`positive integer expected, got ${n2}`);
  }
}
function abytes(b5, ...lengths) {
  if (!isBytes(b5))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b5.length)) {
    const lens = lengths.join(",");
    throw new Error(`Uint8Array expected of length ${lens}, got length=${b5.length}`);
  }
}
function ahash(h4) {
  if (typeof h4 !== "function" || typeof h4.create !== "function") {
    throw new TypeError("Hash should be wrapped by utils.createHasher");
  }
  anumber(h4.outputLen);
  anumber(h4.blockLen);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed === true)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished === true) {
    throw new Error("Hash#digest() has already been called");
  }
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error(`digestInto() expects output buffer of length at least ${min}`);
  }
}
function clean(...arrays) {
  for (const arr of arrays)
    arr.fill(0);
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function kdfInputToBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
var Hash = class {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
var U32_MASK64 = BigInt(2 ** 32 - 1);
var _32n = BigInt(32);
function fromBig(n2, le = false) {
  if (le)
    return { h: Number(n2 & U32_MASK64), l: Number(n2 >> _32n & U32_MASK64) };
  return { h: Number(n2 >> _32n & U32_MASK64) | 0, l: Number(n2 & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  const Ah = new Uint32Array(len);
  const Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h: h4, l: l6 } = fromBig(lst[i], le);
    Ah[i] = h4;
    Al[i] = l6;
  }
  return [Ah, Al];
}
var shrSH = (h4, _l, s4) => h4 >>> s4;
var shrSL = (h4, l6, s4) => h4 << 32 - s4 | l6 >>> s4;
var rotrSH = (h4, l6, s4) => h4 >>> s4 | l6 << 32 - s4;
var rotrSL = (h4, l6, s4) => h4 << 32 - s4 | l6 >>> s4;
var rotrBH = (h4, l6, s4) => h4 << 64 - s4 | l6 >>> s4 - 32;
var rotrBL = (h4, l6, s4) => h4 >>> s4 - 32 | l6 << 64 - s4;
function add(Ah, Al, Bh, Bl) {
  const l6 = (Al >>> 0) + (Bl >>> 0);
  return { h: Ah + Bh + (l6 / 2 ** 32 | 0) | 0, l: l6 | 0 };
}
var add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
var add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
var add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
var add4H = (low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0;
var add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
var add5H = (low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0;
var HashMD = class extends Hash {
  blockLen;
  outputLen;
  padOffset;
  isLE;
  buffer;
  view;
  finished = false;
  length = 0;
  pos = 0;
  destroyed = false;
  constructor(blockLen, outputLen, padOffset, isLE) {
    super();
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4 !== 0)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to ||= new this.constructor();
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen !== 0)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n2 = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n2 & _u32_max);
  const wl = Number(value & _u32_max);
  const h4 = isLE ? 4 : 0;
  const l6 = isLE ? 0 : 4;
  view.setUint32(byteOffset + h4, wh, isLE);
  view.setUint32(byteOffset + l6, wl, isLE);
}
var SHA256_IV = Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);
var K2562 = Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = new Uint32Array(64);
var FastSHA256 = class extends HashMD {
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  A = SHA256_IV[0] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  B = SHA256_IV[1] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  C = SHA256_IV[2] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  D = SHA256_IV[3] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  E = SHA256_IV[4] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  F = SHA256_IV[5] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  G = SHA256_IV[6] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  H = SHA256_IV[7] | 0;
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
  }
  get() {
    const { A: A7, B: B5, C: C2, D, E: E3, F: F4, G, H: H3 } = this;
    return [A7, B5, C2, D, E3, F4, G, H3];
  }
  set(A7, B5, C2, D, E3, F4, G, H3) {
    this.A = A7 | 0;
    this.B = B5 | 0;
    this.C = C2 | 0;
    this.D = D | 0;
    this.E = E3 | 0;
    this.F = F4 | 0;
    this.G = G | 0;
    this.H = H3 | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4) {
      SHA256_W[i] = view.getUint32(offset);
    }
    for (let i = 16; i < 64; i++) {
      const w15 = SHA256_W[i - 15];
      const w22 = SHA256_W[i - 2];
      const s0 = G0_256(w15);
      const s1 = G1_256(w22);
      SHA256_W[i] = sum32(sum32(s0, SHA256_W[i - 7]), sum32(s1, SHA256_W[i - 16]));
    }
    let { A: A7, B: B5, C: C2, D, E: E3, F: F4, G, H: H3 } = this;
    for (let i = 0; i < 64; i++) {
      const T1 = SUM32_5(H3, S1_256(E3), ch32(E3, F4, G), K2562[i], SHA256_W[i]);
      const T2 = sum32(S0_256(A7), maj32(A7, B5, C2));
      H3 = G;
      G = F4;
      F4 = E3;
      E3 = sum32(D, T1);
      D = C2;
      C2 = B5;
      B5 = A7;
      A7 = sum32(T1, T2);
    }
    this.A = sum32(this.A, A7);
    this.B = sum32(this.B, B5);
    this.C = sum32(this.C, C2);
    this.D = sum32(this.D, D);
    this.E = sum32(this.E, E3);
    this.F = sum32(this.F, F4);
    this.G = sum32(this.G, G);
    this.H = sum32(this.H, H3);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    clean(this.buffer);
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
  }
};
var sha256Fast = createHasher(() => new FastSHA256());
var SHA512_IV = Uint32Array.from([
  1779033703,
  4089235720,
  3144134277,
  2227873595,
  1013904242,
  4271175723,
  2773480762,
  1595750129,
  1359893119,
  2917565137,
  2600822924,
  725511199,
  528734635,
  4215389547,
  1541459225,
  327033209
]);
var K512 = (() => split([
  "0x428a2f98d728ae22",
  "0x7137449123ef65cd",
  "0xb5c0fbcfec4d3b2f",
  "0xe9b5dba58189dbbc",
  "0x3956c25bf348b538",
  "0x59f111f1b605d019",
  "0x923f82a4af194f9b",
  "0xab1c5ed5da6d8118",
  "0xd807aa98a3030242",
  "0x12835b0145706fbe",
  "0x243185be4ee4b28c",
  "0x550c7dc3d5ffb4e2",
  "0x72be5d74f27b896f",
  "0x80deb1fe3b1696b1",
  "0x9bdc06a725c71235",
  "0xc19bf174cf692694",
  "0xe49b69c19ef14ad2",
  "0xefbe4786384f25e3",
  "0x0fc19dc68b8cd5b5",
  "0x240ca1cc77ac9c65",
  "0x2de92c6f592b0275",
  "0x4a7484aa6ea6e483",
  "0x5cb0a9dcbd41fbd4",
  "0x76f988da831153b5",
  "0x983e5152ee66dfab",
  "0xa831c66d2db43210",
  "0xb00327c898fb213f",
  "0xbf597fc7beef0ee4",
  "0xc6e00bf33da88fc2",
  "0xd5a79147930aa725",
  "0x06ca6351e003826f",
  "0x142929670a0e6e70",
  "0x27b70a8546d22ffc",
  "0x2e1b21385c26c926",
  "0x4d2c6dfc5ac42aed",
  "0x53380d139d95b3df",
  "0x650a73548baf63de",
  "0x766a0abb3c77b2a8",
  "0x81c2c92e47edaee6",
  "0x92722c851482353b",
  "0xa2bfe8a14cf10364",
  "0xa81a664bbc423001",
  "0xc24b8b70d0f89791",
  "0xc76c51a30654be30",
  "0xd192e819d6ef5218",
  "0xd69906245565a910",
  "0xf40e35855771202a",
  "0x106aa07032bbd1b8",
  "0x19a4c116b8d2d0c8",
  "0x1e376c085141ab53",
  "0x2748774cdf8eeb99",
  "0x34b0bcb5e19b48a8",
  "0x391c0cb3c5c95a63",
  "0x4ed8aa4ae3418acb",
  "0x5b9cca4f7763e373",
  "0x682e6ff3d6b2b8a3",
  "0x748f82ee5defb2fc",
  "0x78a5636f43172f60",
  "0x84c87814a1f0ab72",
  "0x8cc702081a6439ec",
  "0x90befffa23631e28",
  "0xa4506cebde82bde9",
  "0xbef9a3f7b2c67915",
  "0xc67178f2e372532b",
  "0xca273eceea26619c",
  "0xd186b8c721c0c207",
  "0xeada7dd6cde0eb1e",
  "0xf57d4f7fee6ed178",
  "0x06f067aa72176fba",
  "0x0a637dc5a2c898a6",
  "0x113f9804bef90dae",
  "0x1b710b35131c471b",
  "0x28db77f523047d84",
  "0x32caab7b40c72493",
  "0x3c9ebe0a15c9bebc",
  "0x431d67c49c100d4c",
  "0x4cc5d4becb3e42b6",
  "0x597f299cfc657e2a",
  "0x5fcb6fab3ad6faec",
  "0x6c44198c4a475817"
].map(BigInt)))();
var SHA512_Kh = (() => K512[0])();
var SHA512_Kl = (() => K512[1])();
var SHA512_W_H = new Uint32Array(80);
var SHA512_W_L = new Uint32Array(80);
var FastSHA512 = class extends HashMD {
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  Ah = SHA512_IV[0] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  Al = SHA512_IV[1] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  Bh = SHA512_IV[2] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  Bl = SHA512_IV[3] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  Ch = SHA512_IV[4] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  Cl = SHA512_IV[5] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  Dh = SHA512_IV[6] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  Dl = SHA512_IV[7] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  Eh = SHA512_IV[8] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  El = SHA512_IV[9] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  Fh = SHA512_IV[10] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  Fl = SHA512_IV[11] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  Gh = SHA512_IV[12] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  Gl = SHA512_IV[13] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  Hh = SHA512_IV[14] | 0;
  // eslint-disable-next-line no-bitwise -- ToInt32 (ECMA-262); not truncation. Required for SHA arithmetic.
  Hl = SHA512_IV[15] | 0;
  constructor(outputLen = 64) {
    super(128, outputLen, 16, false);
  }
  get() {
    const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
    return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
  }
  set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
    this.Ah = Ah | 0;
    this.Al = Al | 0;
    this.Bh = Bh | 0;
    this.Bl = Bl | 0;
    this.Ch = Ch | 0;
    this.Cl = Cl | 0;
    this.Dh = Dh | 0;
    this.Dl = Dl | 0;
    this.Eh = Eh | 0;
    this.El = El | 0;
    this.Fh = Fh | 0;
    this.Fl = Fl | 0;
    this.Gh = Gh | 0;
    this.Gl = Gl | 0;
    this.Hh = Hh | 0;
    this.Hl = Hl | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 8) {
      SHA512_W_H[i] = view.getUint32(offset);
      SHA512_W_L[i] = view.getUint32(offset + 4);
    }
    for (let i = 16; i < 80; i++) {
      const W15h = SHA512_W_H[i - 15] | 0;
      const W15l = SHA512_W_L[i - 15] | 0;
      const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
      const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
      const W2h = SHA512_W_H[i - 2] | 0;
      const W2l = SHA512_W_L[i - 2] | 0;
      const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
      const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
      const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
      const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
      SHA512_W_H[i] = SUMh | 0;
      SHA512_W_L[i] = SUMl | 0;
    }
    let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
    for (let i = 0; i < 80; i++) {
      const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
      const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
      const CHIh = Eh & Fh ^ ~Eh & Gh;
      const CHIl = El & Fl ^ ~El & Gl;
      const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
      const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
      const T1l = T1ll | 0;
      const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
      const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
      const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
      const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
      Hh = Gh | 0;
      Hl = Gl | 0;
      Gh = Fh | 0;
      Gl = Fl | 0;
      Fh = Eh | 0;
      Fl = El | 0;
      ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
      Dh = Ch | 0;
      Dl = Cl | 0;
      Ch = Bh | 0;
      Cl = Bl | 0;
      Bh = Ah | 0;
      Bl = Al | 0;
      const T2l = add3L(sigma0l, MAJl, T1l);
      Ah = add3H(T2l, sigma0h, MAJh, T1h);
      Al = T2l | 0;
    }
    ;
    ({ h: Ah, l: Al } = add(Ah, Al, this.Ah, this.Al));
    ({ h: Bh, l: Bl } = add(Bh, Bl, this.Bh, this.Bl));
    ({ h: Ch, l: Cl } = add(Ch, Cl, this.Ch, this.Cl));
    ({ h: Dh, l: Dl } = add(Dh, Dl, this.Dh, this.Dl));
    ({ h: Eh, l: El } = add(Eh, El, this.Eh, this.El));
    ({ h: Fh, l: Fl } = add(Fh, Fl, this.Fh, this.Fl));
    ({ h: Gh, l: Gl } = add(Gh, Gl, this.Gh, this.Gl));
    ({ h: Hh, l: Hl } = add(Hh, Hl, this.Hh, this.Hl));
    this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
  }
  roundClean() {
    clean(SHA512_W_H, SHA512_W_L);
  }
  destroy() {
    clean(this.buffer);
    this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
};
var sha512Fast = createHasher(() => new FastSHA512());
var HMAC = class extends Hash {
  oHash;
  iHash;
  blockLen;
  outputLen;
  finished = false;
  destroyed = false;
  constructor(hash, _key) {
    super();
    ahash(hash);
    const key = toBytes(_key);
    this.iHash = hash.create();
    if (typeof this.iHash.update !== "function") {
      throw new TypeError("Expected instance of class which extends utils.Hash");
    }
    this.blockLen = this.iHash.blockLen;
    this.outputLen = this.iHash.outputLen;
    const blockLen = this.blockLen;
    const pad = new Uint8Array(blockLen);
    pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54;
    this.iHash.update(pad);
    this.oHash = hash.create();
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54 ^ 92;
    this.oHash.update(pad);
    clean(pad);
  }
  update(buf) {
    aexists(this);
    this.iHash.update(buf);
    return this;
  }
  digestInto(out) {
    aexists(this);
    abytes(out, this.outputLen);
    this.finished = true;
    this.iHash.digestInto(out);
    this.oHash.update(out);
    this.oHash.digestInto(out);
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.oHash.outputLen);
    this.digestInto(out);
    return out;
  }
  _cloneInto(to) {
    to ||= Object.create(Object.getPrototypeOf(this), {});
    const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
    to = to;
    to.finished = finished;
    to.destroyed = destroyed;
    to.blockLen = blockLen;
    to.outputLen = outputLen;
    to.oHash = oHash._cloneInto(to.oHash ?? void 0);
    to.iHash = iHash._cloneInto(to.iHash ?? void 0);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = true;
    this.oHash.destroy();
    this.iHash.destroy();
  }
};
function pbkdf2Core(hash, password, salt, opts) {
  ahash(hash);
  const { c: c4, dkLen } = Object.assign({ dkLen: 32 }, opts);
  anumber(c4);
  anumber(dkLen);
  if (c4 < 1)
    throw new Error("iterations (c) should be >= 1");
  const pwd = kdfInputToBytes(password);
  const slt = kdfInputToBytes(salt);
  const DK = new Uint8Array(dkLen);
  const PRF = hmac.create(hash, pwd);
  const PRFSalt = PRF._cloneInto().update(slt);
  let prfW;
  const arr = new Uint8Array(4);
  const view = createView(arr);
  const u3 = new Uint8Array(PRF.outputLen);
  for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
    const Ti = DK.subarray(pos, pos + PRF.outputLen);
    view.setInt32(0, ti, false);
    prfW = PRFSalt._cloneInto(prfW);
    prfW.update(arr).digestInto(u3);
    Ti.set(u3.subarray(0, Ti.length));
    for (let ui = 1; ui < c4; ui++) {
      PRF._cloneInto(prfW).update(u3).digestInto(u3);
      for (let i = 0; i < Ti.length; i++)
        Ti[i] ^= u3[i];
    }
  }
  PRF.destroy();
  PRFSalt.destroy();
  if (prfW != null)
    prfW.destroy();
  clean(u3);
  return DK;
}
var hmac = (hash, key, message) => new HMAC(hash, key).update(message).digest();
hmac.create = (hash, key) => new HMAC(hash, key);
function pbkdf2Fast(password, salt, iterations, keylen) {
  return pbkdf2Core(sha512Fast, password, salt, { c: iterations, dkLen: keylen });
}
function pbkdf2(password, salt, iterations, keylen, digest = "sha512") {
  if (digest !== "sha512") {
    throw new Error("Only sha512 is supported in this PBKDF2 implementation");
  }
  const pbkdf2Sync = NODE_CRYPTO?.pbkdf2Sync;
  if (typeof pbkdf2Sync === "function") {
    const out2 = pbkdf2Sync(toHashBytes(password), toHashBytes(salt), iterations, keylen, digest);
    return Array.from(out2);
  }
  const p5 = Uint8Array.from(password);
  const s4 = Uint8Array.from(salt);
  const out = pbkdf2Fast(p5, s4, iterations, keylen);
  return Array.from(out);
}
function swapBytes32(w3) {
  const res = w3 >>> 24 | w3 >>> 8 & 65280 | w3 << 8 & 16711680 | (w3 & 255) << 24;
  return res >>> 0;
}
var isLittleEndian = (() => {
  const b5 = new ArrayBuffer(4);
  const a4 = new Uint32Array(b5);
  const c4 = new Uint8Array(b5);
  a4[0] = 16909060;
  return c4[0] === 4;
})();
function realHtonl(w3) {
  return isLittleEndian ? swapBytes32(w3) : w3 >>> 0;
}

// node_modules/@bsv/sdk/dist/esm/src/primitives/WriterUint8Array.js
var WriterUint8Array = class {
  buffer;
  pos;
  capacity;
  constructor(bufs, initialCapacity = 256) {
    if (bufs != null && bufs.length > 0) {
      const totalLength = bufs.reduce((sum, buf) => sum + buf.length, 0);
      initialCapacity = Math.max(initialCapacity, totalLength);
    }
    this.buffer = new Uint8Array(initialCapacity);
    this.pos = 0;
    this.capacity = initialCapacity;
    if (bufs != null) {
      for (const buf of bufs) {
        this.write(buf);
      }
    }
  }
  /**
   * Returns the current length of written data
   */
  getLength() {
    return this.pos;
  }
  /**
   * @return the written data as Uint8Array copy of the internal buffer
   */
  toUint8Array() {
    return this.buffer.slice(0, this.pos);
  }
  /**
   * Legacy compatibility method – returns number[] (Byte[])
   */
  toArray() {
    return Array.from(this.toUint8Array());
  }
  /**
   * @return the written data as Uint8Array. CAUTION: This is zero-copy subarray of the internal buffer).
   */
  toUint8ArrayZeroCopy() {
    return this.buffer.subarray(0, this.pos);
  }
  ensureCapacity(needed) {
    if (this.pos + needed > this.capacity) {
      let newCapacity = this.capacity * 2;
      while (this.pos + needed > newCapacity) {
        newCapacity *= 2;
      }
      const newBuffer = new Uint8Array(newCapacity);
      newBuffer.set(this.buffer);
      this.buffer = newBuffer;
      this.capacity = newCapacity;
    }
  }
  write(bytes2) {
    const data = bytes2 instanceof Uint8Array ? bytes2 : new Uint8Array(bytes2);
    this.ensureCapacity(data.length);
    this.buffer.set(data, this.pos);
    this.pos += data.length;
    return this;
  }
  writeReverse(buf) {
    const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    this.ensureCapacity(data.length);
    for (let i = data.length - 1; i >= 0; i--) {
      this.buffer[this.pos] = data[i];
      this.pos += 1;
    }
    return this;
  }
  writeUInt8(value) {
    this.ensureCapacity(1);
    this.buffer[this.pos] = value & 255;
    this.pos += 1;
    return this;
  }
  writeInt8(value) {
    this.writeUInt8(value);
    return this;
  }
  writeUInt16LE(value) {
    this.ensureCapacity(2);
    this.buffer[this.pos] = value & 255;
    this.buffer[this.pos + 1] = value >> 8 & 255;
    this.pos += 2;
    return this;
  }
  writeUInt16BE(value) {
    this.ensureCapacity(2);
    this.buffer[this.pos] = value >> 8 & 255;
    this.buffer[this.pos + 1] = value & 255;
    this.pos += 2;
    return this;
  }
  writeInt16LE(value) {
    this.writeUInt16LE(value & 65535);
    return this;
  }
  writeInt16BE(value) {
    this.writeUInt16BE(value & 65535);
    return this;
  }
  writeUInt32LE(value) {
    this.ensureCapacity(4);
    this.buffer[this.pos] = value & 255;
    this.buffer[this.pos + 1] = value >> 8 & 255;
    this.buffer[this.pos + 2] = value >> 16 & 255;
    this.buffer[this.pos + 3] = value >> 24 & 255;
    this.pos += 4;
    return this;
  }
  writeUInt32BE(value) {
    this.ensureCapacity(4);
    this.buffer[this.pos] = value >> 24 & 255;
    this.buffer[this.pos + 1] = value >> 16 & 255;
    this.buffer[this.pos + 2] = value >> 8 & 255;
    this.buffer[this.pos + 3] = value & 255;
    this.pos += 4;
    return this;
  }
  writeInt32LE(value) {
    this.writeUInt32LE(value >>> 0);
    return this;
  }
  writeInt32BE(value) {
    this.writeUInt32BE(value >>> 0);
    return this;
  }
  writeUInt64BEBn(bn) {
    const buf = bn.toArray("be", 8);
    this.write(buf);
    return this;
  }
  writeUInt64LEBn(bn) {
    const buf = bn.toArray("be", 8);
    this.writeReverse(buf);
    return this;
  }
  writeUInt64LE(n2) {
    const buf = new BigNumber(n2).toArray("be", 8);
    this.writeReverse(buf);
    return this;
  }
  writeVarIntNum(n2) {
    const buf = Writer.varIntNum(n2);
    this.write(buf);
    return this;
  }
  writeVarIntBn(bn) {
    const buf = Writer.varIntBn(bn);
    this.write(buf);
    return this;
  }
  /**
   * Resets the writer to empty state (reuses the buffer)
   */
  reset() {
    this.pos = 0;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/ReaderUint8Array.js
var ReaderUint8Array = class _ReaderUint8Array {
  bin;
  pos;
  length;
  static makeReader(bin, pos = 0) {
    if (bin instanceof Uint8Array) {
      return new _ReaderUint8Array(bin, pos);
    }
    if (Array.isArray(bin)) {
      return new Reader(bin, pos);
    }
    throw new Error("ReaderUint8Array.makeReader: bin must be Uint8Array or number[]");
  }
  constructor(bin = new Uint8Array(0), pos = 0) {
    if (bin instanceof Uint8Array) {
      this.bin = bin;
    } else if (Array.isArray(bin)) {
      this.bin = new Uint8Array(bin);
    } else {
      throw new TypeError("ReaderUint8Array constructor: bin must be Uint8Array or number[]");
    }
    this.pos = pos;
    this.length = this.bin.length;
  }
  eof() {
    return this.pos >= this.length;
  }
  read(len = this.length) {
    const start = this.pos;
    const end = this.pos + len;
    this.pos = end;
    return this.bin.slice(start, end);
  }
  readReverse(len = this.length) {
    const buf2 = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      buf2[i] = this.bin[this.pos + len - 1 - i];
    }
    this.pos += len;
    return buf2;
  }
  readUInt8() {
    const val = this.bin[this.pos];
    this.pos += 1;
    return val;
  }
  readInt8() {
    const val = this.bin[this.pos];
    this.pos += 1;
    return (val & 128) === 0 ? val : val - 256;
  }
  readUInt16BE() {
    const val = this.bin[this.pos] << 8 | this.bin[this.pos + 1];
    this.pos += 2;
    return val;
  }
  readInt16BE() {
    const val = this.readUInt16BE();
    return (val & 32768) === 0 ? val : val - 65536;
  }
  readUInt16LE() {
    const val = this.bin[this.pos] | this.bin[this.pos + 1] << 8;
    this.pos += 2;
    return val;
  }
  readInt16LE() {
    const val = this.readUInt16LE();
    const x5 = (val & 32768) === 0 ? val : val - 65536;
    return x5;
  }
  readUInt32BE() {
    const val = this.bin[this.pos] * 16777216 + // Shift the first byte by 24 bits
    (this.bin[this.pos + 1] << 16 | // Shift the second byte by 16 bits
    this.bin[this.pos + 2] << 8 | // Shift the third byte by 8 bits
    this.bin[this.pos + 3]);
    this.pos += 4;
    return val;
  }
  readInt32BE() {
    const val = this.readUInt32BE();
    return (val & 2147483648) === 0 ? val : val - 4294967296;
  }
  readUInt32LE() {
    const val = (this.bin[this.pos] | this.bin[this.pos + 1] << 8 | this.bin[this.pos + 2] << 16 | this.bin[this.pos + 3] << 24) >>> 0;
    this.pos += 4;
    return val;
  }
  readInt32LE() {
    const val = this.readUInt32LE();
    return (val & 2147483648) === 0 ? val : val - 4294967296;
  }
  readUInt64BEBn() {
    const bin = Array.from(this.bin.slice(this.pos, this.pos + 8));
    const bn = new BigNumber(bin);
    this.pos = this.pos + 8;
    return bn;
  }
  readUInt64LEBn() {
    const bin = Array.from(this.readReverse(8));
    const bn = new BigNumber(bin);
    return bn;
  }
  readInt64LEBn() {
    const OverflowInt642 = new BigNumber(2).pow(new BigNumber(63));
    const OverflowUint642 = new BigNumber(2).pow(new BigNumber(64));
    const bin = Array.from(this.readReverse(8));
    let bn = new BigNumber(bin);
    if (bn.gte(OverflowInt642)) {
      bn = bn.sub(OverflowUint642);
    }
    return bn;
  }
  readVarIntNum(signed = true) {
    const first = this.readUInt8();
    let bn;
    switch (first) {
      case 253:
        return this.readUInt16LE();
      case 254:
        return this.readUInt32LE();
      case 255:
        bn = signed ? this.readInt64LEBn() : this.readUInt64LEBn();
        if (bn.lte(new BigNumber(2).pow(new BigNumber(53)))) {
          return bn.toNumber();
        } else {
          throw new Error("number too large to retain precision - use readVarIntBn");
        }
      default:
        return first;
    }
  }
  readVarInt() {
    const first = this.bin[this.pos];
    switch (first) {
      case 253:
        return this.read(1 + 2);
      case 254:
        return this.read(1 + 4);
      case 255:
        return this.read(1 + 8);
      default:
        return this.read(1);
    }
  }
  readVarIntBn() {
    const first = this.readUInt8();
    switch (first) {
      case 253:
        return new BigNumber(this.readUInt16LE());
      case 254:
        return new BigNumber(this.readUInt32LE());
      case 255:
        return this.readUInt64LEBn();
      default:
        return new BigNumber(first);
    }
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/utils.js
var BufferCtor3 = typeof globalThis === "undefined" ? void 0 : globalThis.Buffer;
var CAN_USE_BUFFER3 = BufferCtor3 != null && typeof BufferCtor3.from === "function";
var zero2 = (word) => {
  if (word.length % 2 === 1) {
    return "0" + word;
  } else {
    return word;
  }
};
var HEX_DIGITS2 = "0123456789abcdef";
var HEX_BYTE_STRINGS2 = new Array(256);
for (let i = 0; i < 256; i++) {
  HEX_BYTE_STRINGS2[i] = HEX_DIGITS2[i >> 4 & 15] + HEX_DIGITS2[i & 15];
}
var toHex = (msg) => {
  if (CAN_USE_BUFFER3) {
    return BufferCtor3.from(msg).toString("hex");
  }
  if (msg.length === 0)
    return "";
  const out = new Array(msg.length);
  for (let i = 0; i < msg.length; i++) {
    out[i] = HEX_BYTE_STRINGS2[msg[i] & 255];
  }
  return out.join("");
};
var toUint8Array = (msg, enc) => {
  if (msg instanceof Uint8Array)
    return msg;
  return new Uint8Array(toArray2(msg, enc));
};
var toArray2 = (msg, enc) => {
  if (Array.isArray(msg))
    return msg.slice();
  if (msg === void 0)
    return [];
  if (typeof msg !== "string") {
    return Array.from(msg, (item) => Math.trunc(item));
  }
  switch (enc) {
    case "hex":
      return hexToArray(msg);
    case "base64":
      return base64ToArray(msg);
    default:
      return utf8ToArray(msg);
  }
};
var HEX_CHAR_TO_VALUE2 = new Int8Array(256).fill(-1);
for (let i = 0; i < 10; i++) {
  HEX_CHAR_TO_VALUE2[48 + i] = i;
}
for (let i = 0; i < 6; i++) {
  HEX_CHAR_TO_VALUE2[65 + i] = 10 + i;
  HEX_CHAR_TO_VALUE2[97 + i] = 10 + i;
}
var hexToArray = (msg) => {
  assertValidHex(msg);
  const normalized = msg.length % 2 === 0 ? msg : "0" + msg;
  if (CAN_USE_BUFFER3) {
    return Array.from(BufferCtor3.from(normalized, "hex"));
  }
  const out = new Array(normalized.length / 2);
  let o5 = 0;
  for (let i = 0; i < normalized.length; i += 2) {
    const hi = HEX_CHAR_TO_VALUE2[normalized.codePointAt(i)];
    const lo = HEX_CHAR_TO_VALUE2[normalized.codePointAt(i + 1)];
    out[o5++] = hi << 4 | lo;
  }
  return out;
};
function base64ToArray(msg) {
  if (typeof msg !== "string") {
    throw new TypeError("msg must be a string");
  }
  let s4 = msg.trim().replaceAll(/[\r\n\t\f\v ]+/g, "");
  s4 = s4.replaceAll("-", "+").replaceAll("_", "/");
  const padIndex = s4.indexOf("=");
  if (padIndex !== -1) {
    const pad = s4.slice(padIndex);
    if (!/^={1,2}$/.test(pad)) {
      throw new Error("Invalid base64 padding");
    }
    if (s4.slice(0, padIndex).includes("=")) {
      throw new Error("Invalid base64 padding");
    }
    s4 = s4.slice(0, padIndex);
  }
  const result = [];
  let bitBuffer = 0;
  let bitCount = 0;
  for (let i = 0; i < s4.length; i++) {
    const c4 = s4.codePointAt(i);
    let v3 = -1;
    if (c4 >= 65 && c4 <= 90) {
      v3 = c4 - 65;
    } else if (c4 >= 97 && c4 <= 122) {
      v3 = c4 - 97 + 26;
    } else if (c4 >= 48 && c4 <= 57) {
      v3 = c4 - 48 + 52;
    } else if (c4 === 43) {
      v3 = 62;
    } else if (c4 === 47) {
      v3 = 63;
    } else {
      throw new Error(`Invalid base64 character at index ${i}`);
    }
    bitBuffer = bitBuffer << 6 | v3;
    bitCount += 6;
    while (bitCount >= 8) {
      bitCount -= 8;
      result.push(bitBuffer >> bitCount & 255);
      bitBuffer &= (1 << bitCount) - 1;
    }
  }
  return result;
}
function utf8ToArray(str) {
  return Array.from(new TextEncoder().encode(str));
}
var toUTF8 = (arr) => {
  return new TextDecoder().decode(new Uint8Array(arr));
};
var encode = (arr, enc) => {
  switch (enc) {
    case "hex":
      return toHex(arr);
    case "utf8":
      return toUTF8(arr);
    // If no encoding is provided, return the original array
    default:
      return arr;
  }
};
function toBase64(byteArray) {
  const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let i;
  for (i = 0; i < byteArray.length; i += 3) {
    const byte1 = byteArray[i];
    const byte2 = i + 1 < byteArray.length ? byteArray[i + 1] : 0;
    const byte3 = i + 2 < byteArray.length ? byteArray[i + 2] : 0;
    const encoded1 = byte1 >> 2;
    const encoded2 = (byte1 & 3) << 4 | byte2 >> 4;
    const encoded3 = (byte2 & 15) << 2 | byte3 >> 6;
    const encoded4 = byte3 & 63;
    result += base64Chars.charAt(encoded1) + base64Chars.charAt(encoded2);
    result += i + 1 < byteArray.length ? base64Chars.charAt(encoded3) : "=";
    result += i + 2 < byteArray.length ? base64Chars.charAt(encoded4) : "=";
  }
  return result;
}
var base58chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
var fromBase58 = (str) => {
  if (str === "" || typeof str !== "string") {
    throw new Error(`Expected base58 string but got \u201C${str}\u201D`);
  }
  const match = str.match(/[IOl0]/gmu);
  if (match !== null) {
    throw new Error(`Invalid base58 character \u201C${match.join("")}\u201D`);
  }
  const lz = str.match(/^1+/gmu);
  const psz = lz === null ? 0 : lz[0].length;
  const size = (str.length - psz) * (Math.log(58) / Math.log(256)) + 1 >>> 0;
  const uint8 = new Uint8Array([
    ...new Uint8Array(psz),
    ...(str.match(/./gmu) ?? []).map((i) => base58chars.indexOf(i)).reduce((acc, i) => {
      acc = acc.map((j2) => {
        const x5 = j2 * 58 + i;
        i = x5 >> 8;
        return x5;
      });
      return acc;
    }, new Uint8Array(size)).reverse().filter(/* @__PURE__ */ ((lastValue) => (value) => (
      // @ts-expect-error
      lastValue = lastValue || value
    ))(false))
  ]);
  return [...uint8];
};
var toBase58 = (bin) => {
  const base58Map = new Array(256).fill(-1);
  for (let i = 0; i < base58chars.length; ++i) {
    base58Map[base58chars.codePointAt(i)] = i;
  }
  const result = [];
  for (const byte of bin) {
    let carry = byte;
    for (let j2 = 0; j2 < result.length; ++j2) {
      const x5 = (base58Map[result[j2]] << 8) + carry;
      result[j2] = base58chars.codePointAt(x5 % 58);
      carry = Math.trunc(x5 / 58);
    }
    while (carry !== 0) {
      result.push(base58chars.codePointAt(carry % 58));
      carry = Math.trunc(carry / 58);
    }
  }
  for (const byte of bin) {
    if (byte === 0)
      result.push("1".codePointAt(0));
    else
      break;
  }
  result.reverse();
  return String.fromCodePoint(...result);
};
var toBase58Check = (bin, prefix2 = [0]) => {
  let hash = hash256([...prefix2, ...bin]);
  hash = [...prefix2, ...bin, ...hash.slice(0, 4)];
  return toBase58(hash);
};
var fromBase58Check = (str, enc, prefixLength = 1) => {
  const bin = fromBase58(str);
  let prefix2 = bin.slice(0, prefixLength);
  let data = bin.slice(prefixLength, -4);
  let hash = [...prefix2, ...data];
  hash = hash256(hash);
  bin.slice(-4).forEach((check, index) => {
    if (check !== hash[index]) {
      throw new Error("Invalid checksum");
    }
  });
  if (enc === "hex") {
    prefix2 = toHex(prefix2);
    data = toHex(data);
  }
  return { prefix: prefix2, data };
};
var Writer = class _Writer {
  bufs;
  length;
  constructor(bufs) {
    this.bufs = bufs ?? [];
    this.length = 0;
    for (const b5 of this.bufs)
      this.length += b5.length;
  }
  getLength() {
    return this.length;
  }
  toUint8Array() {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const buf of this.bufs) {
      out.set(buf, offset);
      offset += buf.length;
    }
    return out;
  }
  toArray() {
    const totalLength = this.length;
    const ret = new Array(totalLength);
    let offset = 0;
    for (const buf of this.bufs) {
      if (buf instanceof Uint8Array) {
        for (const byte of buf) {
          ret[offset++] = byte;
        }
      } else {
        const arr = buf;
        for (const item of arr) {
          ret[offset++] = item;
        }
      }
    }
    return ret;
  }
  toHex() {
    return this.toArray().map((n2) => n2.toString(16).padStart(2, "0")).join("");
  }
  write(buf) {
    this.bufs.push(buf);
    this.length += buf.length;
    return this;
  }
  writeReverse(buf) {
    const buf2 = new Array(buf.length);
    for (let i = 0; i < buf2.length; i++) {
      buf2[i] = buf[buf.length - 1 - i];
    }
    return this.write(buf2);
  }
  writeUInt8(n2) {
    const buf = new Array(1);
    buf[0] = n2 & 255;
    this.write(buf);
    return this;
  }
  writeInt8(n2) {
    return this.writeUInt8(n2);
  }
  writeUInt16BE(n2) {
    const buf = [
      n2 >> 8 & 255,
      // shift right 8 bits to get the high byte
      n2 & 255
      // low byte is just the last 8 bits
    ];
    return this.write(buf);
  }
  writeInt16BE(n2) {
    return this.writeUInt16BE(n2 & 65535);
  }
  writeUInt16LE(n2) {
    const buf = [
      n2 & 255,
      // low byte is just the last 8 bits
      n2 >> 8 & 255
      // shift right 8 bits to get the high byte
    ];
    return this.write(buf);
  }
  writeInt16LE(n2) {
    return this.writeUInt16LE(n2 & 65535);
  }
  writeUInt32BE(n2) {
    const buf = [
      n2 >> 24 & 255,
      // highest byte
      n2 >> 16 & 255,
      n2 >> 8 & 255,
      n2 & 255
      // lowest byte
    ];
    return this.write(buf);
  }
  writeInt32BE(n2) {
    return this.writeUInt32BE(n2 >>> 0);
  }
  writeUInt32LE(n2) {
    const buf = [
      n2 & 255,
      // lowest byte
      n2 >> 8 & 255,
      n2 >> 16 & 255,
      n2 >> 24 & 255
      // highest byte
    ];
    return this.write(buf);
  }
  writeInt32LE(n2) {
    return this.writeUInt32LE(n2 >>> 0);
  }
  writeUInt64BEBn(bn) {
    const buf = bn.toArray("be", 8);
    this.write(buf);
    return this;
  }
  writeUInt64LEBn(bn) {
    const buf = bn.toArray("be", 8);
    this.writeReverse(buf);
    return this;
  }
  writeUInt64LE(n2) {
    if (n2 === -1) {
      this.write(new Array(8).fill(255));
    } else {
      const buf = new BigNumber(n2).toArray("be", 8);
      this.writeReverse(buf);
    }
    return this;
  }
  writeVarIntNum(n2) {
    const buf = _Writer.varIntNum(n2);
    this.write(buf);
    return this;
  }
  writeVarIntBn(bn) {
    const buf = _Writer.varIntBn(bn);
    this.write(buf);
    return this;
  }
  static varIntNum(n2) {
    let buf;
    if (n2 < 0) {
      return this.varIntBn(new BigNumber(n2));
    }
    if (n2 < 253) {
      buf = [n2];
    } else if (n2 < 65536) {
      buf = [
        253,
        // 0xfd
        n2 & 255,
        // low byte
        n2 >> 8 & 255
        // high byte
      ];
    } else if (n2 < 4294967296) {
      buf = [
        254,
        // 0xfe
        n2 & 255,
        n2 >> 8 & 255,
        n2 >> 16 & 255,
        n2 >> 24 & 255
      ];
    } else {
      const low = n2 & 4294967295;
      const high = Math.floor(n2 / 4294967296) & 4294967295;
      buf = [
        255,
        // 0xff
        low & 255,
        low >> 8 & 255,
        low >> 16 & 255,
        low >> 24 & 255,
        high & 255,
        high >> 8 & 255,
        high >> 16 & 255,
        high >> 24 & 255
      ];
    }
    return buf;
  }
  static varIntBn(bn) {
    let buf;
    if (bn.isNeg()) {
      bn = bn.add(OverflowUint64);
    }
    if (bn.ltn(253)) {
      const n2 = bn.toNumber();
      buf = [n2];
    } else if (bn.ltn(65536)) {
      const n2 = bn.toNumber();
      buf = [253, n2 & 255, n2 >> 8 & 255];
    } else if (bn.lt(new BigNumber(4294967296))) {
      const n2 = bn.toNumber();
      buf = [
        254,
        n2 & 255,
        n2 >> 8 & 255,
        n2 >> 16 & 255,
        n2 >> 24 & 255
      ];
    } else {
      const bw = new _Writer();
      bw.writeUInt8(255);
      bw.writeUInt64LEBn(bn);
      buf = bw.toArray();
    }
    return buf;
  }
};
var Reader = class {
  bin;
  pos;
  length;
  constructor(bin = [], pos = 0) {
    this.bin = bin;
    this.pos = pos;
    this.length = bin.length;
  }
  eof() {
    return this.pos >= this.length;
  }
  read(len = this.length) {
    const start = this.pos;
    const end = this.pos + len;
    this.pos = end;
    return this.bin.slice(start, end);
  }
  readReverse(len = this.length) {
    const buf2 = new Array(len);
    for (let i = 0; i < len; i++) {
      buf2[i] = this.bin[this.pos + len - 1 - i];
    }
    this.pos += len;
    return buf2;
  }
  readUInt8() {
    const val = this.bin[this.pos];
    this.pos += 1;
    return val;
  }
  readInt8() {
    const val = this.bin[this.pos];
    this.pos += 1;
    return (val & 128) === 0 ? val : val - 256;
  }
  readUInt16BE() {
    const val = this.bin[this.pos] << 8 | this.bin[this.pos + 1];
    this.pos += 2;
    return val;
  }
  readInt16BE() {
    const val = this.readUInt16BE();
    return (val & 32768) === 0 ? val : val - 65536;
  }
  readUInt16LE() {
    const val = this.bin[this.pos] | this.bin[this.pos + 1] << 8;
    this.pos += 2;
    return val;
  }
  readInt16LE() {
    const val = this.readUInt16LE();
    const x5 = (val & 32768) === 0 ? val : val - 65536;
    return x5;
  }
  readUInt32BE() {
    const val = this.bin[this.pos] * 16777216 + // Shift the first byte by 24 bits
    (this.bin[this.pos + 1] << 16 | // Shift the second byte by 16 bits
    this.bin[this.pos + 2] << 8 | // Shift the third byte by 8 bits
    this.bin[this.pos + 3]);
    this.pos += 4;
    return val;
  }
  readInt32BE() {
    const val = this.readUInt32BE();
    return (val & 2147483648) === 0 ? val : val - 4294967296;
  }
  readUInt32LE() {
    const val = (this.bin[this.pos] | this.bin[this.pos + 1] << 8 | this.bin[this.pos + 2] << 16 | this.bin[this.pos + 3] << 24) >>> 0;
    this.pos += 4;
    return val;
  }
  readInt32LE() {
    const val = this.readUInt32LE();
    return (val & 2147483648) === 0 ? val : val - 4294967296;
  }
  readUInt64BEBn() {
    const bin = this.bin.slice(this.pos, this.pos + 8);
    const bn = new BigNumber(bin);
    this.pos = this.pos + 8;
    return bn;
  }
  readUInt64LEBn() {
    const bin = this.readReverse(8);
    const bn = new BigNumber(bin);
    return bn;
  }
  readInt64LEBn() {
    const bin = this.readReverse(8);
    let bn = new BigNumber(bin);
    if (bn.gte(OverflowInt64)) {
      bn = bn.sub(OverflowUint64);
    }
    return bn;
  }
  readVarIntNum(signed = true) {
    const first = this.readUInt8();
    let bn;
    switch (first) {
      case 253:
        return this.readUInt16LE();
      case 254:
        return this.readUInt32LE();
      case 255:
        bn = signed ? this.readInt64LEBn() : this.readUInt64LEBn();
        if (bn.lte(new BigNumber(2).pow(new BigNumber(53)))) {
          return bn.toNumber();
        } else {
          throw new Error("number too large to retain precision - use readVarIntBn");
        }
      default:
        return first;
    }
  }
  readVarInt() {
    const first = this.bin[this.pos];
    switch (first) {
      case 253:
        return this.read(1 + 2);
      case 254:
        return this.read(1 + 4);
      case 255:
        return this.read(1 + 8);
      default:
        return this.read(1);
    }
  }
  readVarIntBn() {
    const first = this.readUInt8();
    switch (first) {
      case 253:
        return new BigNumber(this.readUInt16LE());
      case 254:
        return new BigNumber(this.readUInt32LE());
      case 255:
        return this.readUInt64LEBn();
      default:
        return new BigNumber(first);
    }
  }
};
var minimallyEncode = (buf) => {
  if (buf.length === 0) {
    return buf;
  }
  const last = buf.at(-1);
  if ((last & 127) !== 0) {
    return buf;
  }
  if (buf.length === 1) {
    return [];
  }
  if ((buf.at(-2) & 128) !== 0) {
    return buf;
  }
  for (let i = buf.length - 1; i > 0; i--) {
    if (buf[i - 1] !== 0) {
      if ((buf[i - 1] & 128) === 0) {
        buf[i - 1] |= last;
        return buf.slice(0, i);
      } else {
        buf[i] = last;
        return buf.slice(0, i + 1);
      }
    }
  }
  return [];
};
var OverflowInt64 = new BigNumber(2).pow(new BigNumber(63));
var OverflowUint64 = new BigNumber(2).pow(new BigNumber(64));
function verifyNotNull(value, errorMessage = "Expected a valid value, but got undefined or null.") {
  if (value == null)
    throw new Error(errorMessage);
  return value;
}
function constantTimeEquals(a4, b5) {
  if (a4.length !== b5.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a4.length; i++) {
    diff |= a4[i] ^ b5[i];
  }
  return diff === 0;
}

// node_modules/@bsv/sdk/dist/esm/src/primitives/Point.js
function ctSwap(swap, a4, b5) {
  const mask = -swap;
  const swapX = (a4.X ^ b5.X) & mask;
  const swapY = (a4.Y ^ b5.Y) & mask;
  const swapZ = (a4.Z ^ b5.Z) & mask;
  a4.X ^= swapX;
  b5.X ^= swapX;
  a4.Y ^= swapY;
  b5.Y ^= swapY;
  a4.Z ^= swapZ;
  b5.Z ^= swapZ;
}
var BI_ZERO = 0n;
var BI_ONE = 1n;
var BI_TWO = 2n;
var BI_THREE = 3n;
var BI_FOUR = 4n;
var BI_EIGHT = 8n;
var P_BIGINT = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
var N_BIGINT = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
var MASK_256 = (1n << 256n) - 1n;
function red(x5) {
  let hi = x5 >> 256n;
  x5 = (x5 & MASK_256) + (hi << 32n) + hi * 977n;
  hi = x5 >> 256n;
  x5 = (x5 & MASK_256) + (hi << 32n) + hi * 977n;
  if (x5 >= P_BIGINT)
    x5 -= P_BIGINT;
  return x5;
}
var biMod = (a4) => red((a4 % P_BIGINT + P_BIGINT) % P_BIGINT);
var biModSub = (a4, b5) => a4 >= b5 ? a4 - b5 : P_BIGINT - (b5 - a4);
var biModMul = (a4, b5) => red(a4 * b5);
var biModAdd = (a4, b5) => red(a4 + b5);
var biModInv = (a4) => {
  let lm = BI_ONE;
  let hm = BI_ZERO;
  let low = biMod(a4);
  let high = P_BIGINT;
  while (low > BI_ONE) {
    const r3 = high / low;
    [lm, hm] = [hm - lm * r3, lm];
    [low, high] = [high - low * r3, low];
  }
  return biMod(lm);
};
var biModSqr = (a4) => biModMul(a4, a4);
var biModPow = (base, exp) => {
  let result = 1n;
  base = biMod(base);
  while (exp > 0n) {
    if ((exp & 1n) !== 0n) {
      result = biModMul(result, base);
    }
    base = biModMul(base, base);
    exp >>= 1n;
  }
  return result;
};
var P_PLUS1_DIV4 = P_BIGINT + 1n >> 2n;
var biModSqrt = (a4) => {
  const r3 = biModPow(a4, P_PLUS1_DIV4);
  if (biModMul(r3, r3) !== biMod(a4)) {
    return null;
  }
  return r3;
};
var toBigInt = (x5) => {
  if (BigNumber.isBN(x5))
    return BigInt("0x" + x5.toString(16));
  if (typeof x5 === "string")
    return BigInt("0x" + x5);
  if (Array.isArray(x5))
    return BigInt("0x" + toHex(x5));
  return BigInt(x5);
};
var GX_BIGINT = BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798");
var GY_BIGINT = BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8");
var WNAF_TABLE_CACHE = /* @__PURE__ */ new Map();
var jpDouble = (P2) => {
  const { X: X1, Y: Y1, Z: Z1 } = P2;
  if (Y1 === BI_ZERO)
    return { X: BI_ZERO, Y: BI_ONE, Z: BI_ZERO };
  const Y1sq = biModMul(Y1, Y1);
  const S4 = biModMul(BI_FOUR, biModMul(X1, Y1sq));
  const M2 = biModMul(BI_THREE, biModMul(X1, X1));
  const X3 = biModSub(biModMul(M2, M2), biModMul(BI_TWO, S4));
  const Y3 = biModSub(biModMul(M2, biModSub(S4, X3)), biModMul(BI_EIGHT, biModMul(Y1sq, Y1sq)));
  const Z3 = biModMul(BI_TWO, biModMul(Y1, Z1));
  return { X: X3, Y: Y3, Z: Z3 };
};
var jpAdd = (P2, Q2) => {
  if (P2.Z === BI_ZERO)
    return Q2;
  if (Q2.Z === BI_ZERO)
    return P2;
  const Z1Z1 = biModMul(P2.Z, P2.Z);
  const Z2Z2 = biModMul(Q2.Z, Q2.Z);
  const U1 = biModMul(P2.X, Z2Z2);
  const U22 = biModMul(Q2.X, Z1Z1);
  const S1 = biModMul(P2.Y, biModMul(Z2Z2, Q2.Z));
  const S22 = biModMul(Q2.Y, biModMul(Z1Z1, P2.Z));
  const H3 = biModSub(U22, U1);
  const r3 = biModSub(S22, S1);
  if (H3 === BI_ZERO) {
    if (r3 === BI_ZERO)
      return jpDouble(P2);
    return { X: BI_ZERO, Y: BI_ONE, Z: BI_ZERO };
  }
  const HH = biModMul(H3, H3);
  const HHH = biModMul(H3, HH);
  const V2 = biModMul(U1, HH);
  const X3 = biModSub(biModSub(biModMul(r3, r3), HHH), biModMul(BI_TWO, V2));
  const Y3 = biModSub(biModMul(r3, biModSub(V2, X3)), biModMul(S1, HHH));
  const Z3 = biModMul(H3, biModMul(P2.Z, Q2.Z));
  return { X: X3, Y: Y3, Z: Z3 };
};
var jpNeg = (P2) => {
  if (P2.Z === BI_ZERO)
    return P2;
  return { X: P2.X, Y: P_BIGINT - P2.Y, Z: P2.Z };
};
var scalarMultiplyWNAF = (k4, P0, window2 = 5) => {
  const key = `${window2}:${P0.x.toString(16)}:${P0.y.toString(16)}`;
  let tbl = WNAF_TABLE_CACHE.get(key);
  if (tbl === void 0) {
    const tblSize = 1 << window2 - 1;
    tbl = new Array(tblSize);
    const P2 = { X: P0.x, Y: P0.y, Z: BI_ONE };
    tbl[0] = P2;
    const twoP = jpDouble(P2);
    for (let i = 1; i < tblSize; i++) {
      tbl[i] = jpAdd(tbl[i - 1], twoP);
    }
    WNAF_TABLE_CACHE.set(key, tbl);
  }
  const wnaf = [];
  const wBig = 1n << BigInt(window2);
  const wHalf = wBig >> 1n;
  let kTmp = k4;
  while (kTmp > 0n) {
    if ((kTmp & BI_ONE) === BI_ZERO) {
      wnaf.push(0);
      kTmp >>= BI_ONE;
    } else {
      let z2 = kTmp & wBig - 1n;
      if (z2 > wHalf)
        z2 -= wBig;
      wnaf.push(Number(z2));
      kTmp -= z2;
      kTmp >>= BI_ONE;
    }
  }
  let Q2 = { X: BI_ZERO, Y: BI_ONE, Z: BI_ZERO };
  for (let i = wnaf.length - 1; i >= 0; i--) {
    Q2 = jpDouble(Q2);
    const di = wnaf[i];
    if (di !== 0) {
      const idx = Math.abs(di) >> 1;
      const addend = di > 0 ? tbl[idx] : jpNeg(tbl[idx]);
      Q2 = jpAdd(Q2, addend);
    }
  }
  return Q2;
};
var modN = (a4) => {
  let r3 = a4 % N_BIGINT;
  if (r3 < 0n)
    r3 += N_BIGINT;
  return r3;
};
var modMulN = (a4, b5) => modN(a4 * b5);
var modInvN = (a4) => {
  let lm = 1n;
  let hm = 0n;
  let low = modN(a4);
  let high = N_BIGINT;
  while (low > 1n) {
    const q3 = high / low;
    [lm, hm] = [hm - lm * q3, lm];
    [low, high] = [high - low * q3, low];
  }
  return modN(lm);
};
var Point = class _Point extends BasePoint {
  x;
  y;
  inf;
  static _assertOnCurve(p5) {
    if (!p5.validate()) {
      throw new Error("Invalid point");
    }
    return p5;
  }
  /**
   * Creates a point object from a given Array. These numbers can represent coordinates in hex format, or points
   * in multiple established formats.
   * The function verifies the integrity of the provided data and throws errors if inconsistencies are found.
   *
   * @method fromDER
   * @static
   * @param bytes - The point representation number array.
   * @returns Returns a new point representing the given string.
   * @throws `Error` If the point number[] value has a wrong length.
   * @throws `Error` If the point format is unknown.
   *
   * @example
   * const derPoint = [ 2, 18, 123, 108, 125, 83, 1, 251, 164, 214, 16, 119, 200, 216, 210, 193, 251, 193, 129, 67, 97, 146, 210, 216, 77, 254, 18, 6, 150, 190, 99, 198, 128 ];
   * const point = Point.fromDER(derPoint);
   */
  static fromDER(bytes2) {
    const len = 32;
    if ((bytes2[0] === 4 || bytes2[0] === 6 || bytes2[0] === 7) && bytes2.length - 1 === 2 * len) {
      if (bytes2[0] === 6) {
        if (bytes2.at(-1) % 2 !== 0) {
          throw new Error("Point string value is wrong length");
        }
      } else if (bytes2[0] === 7) {
        if (bytes2.at(-1) % 2 !== 1) {
          throw new Error("Point string value is wrong length");
        }
      }
      const res = new _Point(bytes2.slice(1, 1 + len), bytes2.slice(1 + len, 1 + 2 * len));
      return _Point._assertOnCurve(res);
    } else if ((bytes2[0] === 2 || bytes2[0] === 3) && bytes2.length - 1 === len) {
      return _Point._assertOnCurve(_Point.fromX(bytes2.slice(1, 1 + len), bytes2[0] === 3));
    }
    throw new Error("Unknown point format");
  }
  /**
   * Creates a point object from a given string. This string can represent coordinates in hex format, or points
   * in multiple established formats.
   * The function verifies the integrity of the provided data and throws errors if inconsistencies are found.
   *
   * @method fromString
   * @static
   *
   * @param str The point representation string.
   * @returns Returns a new point representing the given string.
   * @throws `Error` If the point string value has a wrong length.
   * @throws `Error` If the point format is unknown.
   *
   * @example
   * const pointStr = 'abcdef';
   * const point = Point.fromString(pointStr);
   */
  static fromString(str) {
    const bytes2 = toArray2(str, "hex");
    return _Point._assertOnCurve(_Point.fromDER(bytes2));
  }
  /**
   * Generates a point from an x coordinate and a boolean indicating whether the corresponding
   * y coordinate is odd.
   *
   * @method fromX
   * @static
   * @param x - The x coordinate of the point.
   * @param odd - Boolean indicating whether the corresponding y coordinate is odd or not.
   * @returns Returns the new point.
   * @throws `Error` If the point is invalid.
   *
   * @example
   * const xCoordinate = new BigNumber('10');
   * const point = Point.fromX(xCoordinate, true);
   */
  static fromX(x5, odd) {
    let xBigInt = toBigInt(x5);
    xBigInt = biMod(xBigInt);
    const y22 = biModAdd(biModMul(biModSqr(xBigInt), xBigInt), 7n);
    const y7 = biModSqrt(y22);
    if (y7 === null) {
      throw new Error("Invalid point");
    }
    let yBig = y7;
    if ((yBig & BI_ONE) !== (odd ? BI_ONE : BI_ZERO)) {
      yBig = biModSub(P_BIGINT, yBig);
    }
    const xBN = new BigNumber(xBigInt.toString(16), 16);
    const yBN = new BigNumber(yBig.toString(16), 16);
    return _Point._assertOnCurve(new _Point(xBN, yBN));
  }
  /**
   * Generates a point from a serialized JSON object. The function accounts for different options in the JSON object,
   * including precomputed values for optimization of EC operations, and calls another helper function to turn nested
   * JSON points into proper Point objects.
   *
   * @method fromJSON
   * @static
   * @param obj - An object or array that holds the data for the point.
   * @param isRed - A boolean to direct how the Point is constructed from the JSON object.
   * @returns Returns a new point based on the deserialized JSON object.
   *
   * @example
   * const serializedPoint = '{"x":52,"y":15}';
   * const point = Point.fromJSON(serializedPoint, true);
   */
  static fromJSON(obj, isRed) {
    if (typeof obj === "string") {
      obj = JSON.parse(obj);
    }
    let res = new _Point(obj[0], obj[1], isRed);
    res = _Point._assertOnCurve(res);
    if (typeof obj[2] !== "object" || obj[2] === null) {
      return res;
    }
    const pre = obj[2];
    const obj2point = (p5) => {
      const pt = new _Point(p5[0], p5[1], isRed);
      return _Point._assertOnCurve(pt);
    };
    res.precomputed = {
      beta: null,
      doubles: typeof pre.doubles === "object" && pre.doubles !== null ? {
        step: pre.doubles.step,
        points: [res].concat(pre.doubles.points.map(obj2point))
      } : void 0,
      naf: typeof pre.naf === "object" && pre.naf !== null ? {
        wnd: pre.naf.wnd,
        points: [res].concat(pre.naf.points.map(obj2point))
      } : void 0
    };
    return res;
  }
  /**
   * @constructor
   * @param x - The x-coordinate of the point. May be a number, a BigNumber, a string (which will be interpreted as hex), a number array, or null. If null, an "Infinity" point is constructed.
   * @param y - The y-coordinate of the point, similar to x.
   * @param isRed - A boolean indicating if the point is a member of the field of integers modulo the k256 prime. Default is true.
   *
   * @example
   * new Point('abc123', 'def456');
   * new Point(null, null); // Generates Infinity point.
   */
  constructor(x5, y7, isRed = true) {
    super("affine");
    this.precomputed = null;
    if (x5 === null && y7 === null) {
      this.x = null;
      this.y = null;
      this.inf = true;
    } else {
      if (!BigNumber.isBN(x5)) {
        x5 = new BigNumber(x5, 16);
      }
      this.x = x5;
      if (!BigNumber.isBN(y7)) {
        y7 = new BigNumber(y7, 16);
      }
      this.y = y7;
      if (isRed) {
        this.x.forceRed(this.curve.red);
        this.y.forceRed(this.curve.red);
      }
      if (this.x.red === null) {
        this.x = this.x.toRed(this.curve.red);
      }
      if (this.y.red === null) {
        this.y = this.y.toRed(this.curve.red);
      }
      this.inf = false;
    }
  }
  /**
   * Validates if a point belongs to the curve. Follows the short Weierstrass
   * equation for elliptic curves: y^2 = x^3 + ax + b.
   *
   * @method validate
   * @returns {boolean} true if the point is on the curve, false otherwise.
   *
   * @example
   * const aPoint = new Point(x, y);
   * const isValid = aPoint.validate();
   */
  validate() {
    if (this.inf || this.x == null || this.y == null)
      return false;
    try {
      const xBig = BigInt("0x" + this.x.fromRed().toString(16));
      const yBig = BigInt("0x" + this.y.fromRed().toString(16));
      const lhs = biModMul(yBig, yBig);
      const rhs = biModAdd(biModMul(biModMul(xBig, xBig), xBig), 7n);
      return lhs === rhs;
    } catch {
      return false;
    }
  }
  /**
   * Encodes the coordinates of a point into an array or a hexadecimal string.
   * The details of encoding are determined by the optional compact and enc parameters.
   *
   * @method encode
   * @param compact - If true, an additional prefix byte 0x02 or 0x03 based on the 'y' coordinate being even or odd respectively is used. If false, byte 0x04 is used.
   * @param enc - Expects the string 'hex' if hexadecimal string encoding is required instead of an array of numbers.
   * @throws Will throw an error if the specified encoding method is not recognized. Expects 'hex'.
   * @returns If enc is undefined, a byte array representation of the point will be returned. if enc is 'hex', a hexadecimal string representation of the point will be returned.
   *
   * @example
   * const aPoint = new Point(x, y);
   * const encodedPointArray = aPoint.encode();
   * const encodedPointHex = aPoint.encode(true, 'hex');
   */
  encode(compact = true, enc) {
    if (this.inf) {
      if (enc === "hex")
        return "00";
      return [0];
    }
    const len = this.curve.p.byteLength();
    const x5 = this.getX().toArray("be", len);
    let res;
    if (compact) {
      res = [this.getY().isEven() ? 2 : 3].concat(x5);
    } else {
      res = [4].concat(x5, this.getY().toArray("be", len));
    }
    if (enc === "hex") {
      return toHex(res);
    } else {
      return res;
    }
  }
  /**
   * Converts the point coordinates to a hexadecimal string. A wrapper method
   * for encode. Byte 0x02 or 0x03 is used as prefix based on the 'y' coordinate being even or odd respectively.
   *
   * @method toString
   * @returns {string} A hexadecimal string representation of the point coordinates.
   *
   * @example
   * const aPoint = new Point(x, y);
   * const stringPoint = aPoint.toString();
   */
  toString() {
    return this.encode(true, "hex");
  }
  /**
   * Exports the x and y coordinates of the point, and the precomputed doubles and non-adjacent form (NAF) for optimization. The output is an array.
   *
   * @method toJSON
   * @returns An Array where first two elements are the coordinates of the point and optional third element is an object with doubles and NAF points.
   *
   * @example
   * const aPoint = new Point(x, y);
   * const jsonPoint = aPoint.toJSON();
   */
  toJSON() {
    if (this.precomputed == null) {
      return [this.x, this.y];
    }
    return [
      this.x,
      this.y,
      typeof this.precomputed === "object" && this.precomputed !== null ? {
        doubles: this.precomputed.doubles == null ? void 0 : {
          step: this.precomputed.doubles.step,
          points: this.precomputed.doubles.points.slice(1)
        },
        naf: this.precomputed.naf == null ? void 0 : {
          wnd: this.precomputed.naf.wnd,
          points: this.precomputed.naf.points.slice(1)
        }
      } : void 0
    ];
  }
  /**
   * Provides the point coordinates in a human-readable string format for debugging purposes.
   *
   * @method inspect
   * @returns String of the format '<EC Point x: x-coordinate y: y-coordinate>', or '<EC Point Infinity>' if the point is at infinity.
   *
   * @example
   * const aPoint = new Point(x, y);
   * console.log(aPoint.inspect());
   */
  inspect() {
    if (this.isInfinity()) {
      return "<EC Point Infinity>";
    }
    return "<EC Point x: " + (this.x?.fromRed()?.toString(16, 2) ?? "undefined") + " y: " + (this.y?.fromRed()?.toString(16, 2) ?? "undefined") + ">";
  }
  /**
   * Checks if the point is at infinity.
   * @method isInfinity
   * @returns Returns whether or not the point is at infinity.
   *
   * @example
   * const p = new Point(null, null);
   * console.log(p.isInfinity()); // outputs: true
   */
  isInfinity() {
    return this.inf;
  }
  /**
   * Adds another Point to this Point, returning a new Point.
   *
   * @method add
   * @param p - The Point to add to this one.
   * @returns A new Point that results from the addition.
   *
   * @example
   * const p1 = new Point(1, 2);
   * const p2 = new Point(2, 3);
   * const result = p1.add(p2);
   */
  add(p5) {
    if (this.inf) {
      return p5;
    }
    if (p5.inf) {
      return this;
    }
    if (this.eq(p5)) {
      return this.dbl();
    }
    if (this.neg().eq(p5)) {
      return new _Point(null, null);
    }
    if (this.x?.cmp(p5.x ?? new BigNumber(0)) === 0) {
      return new _Point(null, null);
    }
    const P1 = {
      X: BigInt("0x" + this.x.fromRed().toString(16)),
      Y: BigInt("0x" + this.y.fromRed().toString(16)),
      Z: BI_ONE
    };
    const Q1 = {
      X: BigInt("0x" + p5.x.fromRed().toString(16)),
      Y: BigInt("0x" + p5.y.fromRed().toString(16)),
      Z: BI_ONE
    };
    const R6 = jpAdd(P1, Q1);
    if (R6.Z === BI_ZERO)
      return new _Point(null, null);
    const zInv = biModInv(R6.Z);
    const zInv2 = biModMul(zInv, zInv);
    const xRes = biModMul(R6.X, zInv2);
    const yRes = biModMul(R6.Y, biModMul(zInv2, zInv));
    return new _Point(xRes.toString(16), yRes.toString(16));
  }
  /**
   * Doubles the current point.
   *
   * @method dbl
   *
   * @example
   * const P = new Point('123', '456');
   * const result = P.dbl();
   * */
  dbl() {
    if (this.inf)
      return this;
    if (this.x === null || this.y === null) {
      throw new Error("Point coordinates cannot be null");
    }
    const X2 = BigInt("0x" + this.x.fromRed().toString(16));
    const Y2 = BigInt("0x" + this.y.fromRed().toString(16));
    if (Y2 === BI_ZERO)
      return new _Point(null, null);
    const R6 = jpDouble({ X: X2, Y: Y2, Z: BI_ONE });
    const zInv = biModInv(R6.Z);
    const zInv2 = biModMul(zInv, zInv);
    const xRes = biModMul(R6.X, zInv2);
    const yRes = biModMul(R6.Y, biModMul(zInv2, zInv));
    return new _Point(xRes.toString(16), yRes.toString(16));
  }
  /**
   * Returns X coordinate of point
   *
   * @example
   * const P = new Point('123', '456');
   * const x = P.getX();
   */
  getX() {
    return (this.x ?? new BigNumber(0)).fromRed();
  }
  /**
   * Returns X coordinate of point
   *
   * @example
   * const P = new Point('123', '456');
   * const x = P.getX();
   */
  getY() {
    return (this.y ?? new BigNumber(0)).fromRed();
  }
  /**
   * Multiplies this Point by a scalar value, returning a new Point.
   *
   * @method mul
   * @param k - The scalar value to multiply this Point by.
   * @returns  A new Point that results from the multiplication.
   *
   * @example
   * const p = new Point(1, 2);
   * const result = p.mul(2); // this doubles the Point
   */
  mul(k4) {
    if (!BigNumber.isBN(k4)) {
      k4 = new BigNumber(k4, 16);
    }
    k4 = k4;
    if (this.inf) {
      return this;
    }
    const isNeg = k4.isNeg();
    const kAbs = isNeg ? k4.neg() : k4;
    let kBig = BigInt("0x" + kAbs.toString(16));
    kBig = biMod(kBig);
    if (kBig === BI_ZERO) {
      return new _Point(null, null);
    }
    if (kBig === BI_ZERO) {
      return new _Point(null, null);
    }
    if (this.x === null || this.y === null) {
      throw new Error("Point coordinates cannot be null");
    }
    let Px;
    let Py;
    if (this === this.curve.g) {
      Px = GX_BIGINT;
      Py = GY_BIGINT;
    } else {
      Px = BigInt("0x" + this.x.fromRed().toString(16));
      Py = BigInt("0x" + this.y.fromRed().toString(16));
    }
    const R6 = scalarMultiplyWNAF(kBig, { x: Px, y: Py });
    if (R6.Z === BI_ZERO) {
      return new _Point(null, null);
    }
    const zInv = biModInv(R6.Z);
    const zInv2 = biModMul(zInv, zInv);
    const xRes = biModMul(R6.X, zInv2);
    const yRes = biModMul(R6.Y, biModMul(zInv2, zInv));
    const xBN = new BigNumber(xRes.toString(16), 16);
    const yBN = new BigNumber(yRes.toString(16), 16);
    const result = new _Point(xBN, yBN);
    if (isNeg) {
      return result.neg();
    }
    return result;
  }
  mulCT(k4) {
    if (!BigNumber.isBN(k4)) {
      k4 = new BigNumber(k4, 16);
    }
    k4 = k4;
    if (this.inf)
      return new _Point(null, null);
    const isNeg = k4.isNeg();
    const kAbs = isNeg ? k4.neg() : k4;
    let kBig = BigInt("0x" + kAbs.toString(16));
    kBig = biMod(kBig);
    if (kBig === 0n)
      return new _Point(null, null);
    const Px = this === this.curve.g ? GX_BIGINT : BigInt("0x" + this.getX().toString(16));
    const Py = this === this.curve.g ? GY_BIGINT : BigInt("0x" + this.getY().toString(16));
    let R0 = { X: 0n, Y: 1n, Z: 0n };
    let R1 = { X: Px, Y: Py, Z: 1n };
    const bits = kBig.toString(2);
    for (const bitChar of bits) {
      const bit = bitChar === "1" ? 1n : 0n;
      ctSwap(bit, R0, R1);
      R1 = jpAdd(R0, R1);
      R0 = jpDouble(R0);
      ctSwap(bit, R0, R1);
    }
    if (R0.Z === 0n)
      return new _Point(null, null);
    const zInv = biModInv(R0.Z);
    const zInv2 = biModMul(zInv, zInv);
    const x5 = biModMul(R0.X, zInv2);
    const y7 = biModMul(R0.Y, biModMul(zInv2, zInv));
    const result = new _Point(x5.toString(16), y7.toString(16));
    return isNeg ? result.neg() : result;
  }
  /**
   * Performs a multiplication and addition operation in a single step.
   * Multiplies this Point by k1, adds the resulting Point to the result of p2 multiplied by k2.
   *
   * @method mulAdd
   * @param k1 - The scalar value to multiply this Point by.
   * @param p2 - The other Point to be involved in the operation.
   * @param k2 - The scalar value to multiply the Point p2 by.
   * @returns A Point that results from the combined multiplication and addition operations.
   *
   * @example
   * const p1 = new Point(1, 2);
   * const p2 = new Point(2, 3);
   * const result = p1.mulAdd(2, p2, 3);
   */
  mulAdd(k1, p22, k22) {
    const points = [this, p22];
    const coeffs = [k1, k22];
    return this._endoWnafMulAdd(points, coeffs);
  }
  /**
   * Performs the Jacobian multiplication and addition operation in a single
   * step. Instead of returning a regular Point, the result is a JacobianPoint.
   *
   * @method jmulAdd
   * @param k1 - The scalar value to multiply this Point by.
   * @param p2 - The other Point to be involved in the operation
   * @param k2 - The scalar value to multiply the Point p2 by.
   * @returns A JacobianPoint that results from the combined multiplication and addition operation.
   *
   * @example
   * const p1 = new Point(1, 2);
   * const p2 = new Point(2, 3);
   * const result = p1.jmulAdd(2, p2, 3);
   */
  jmulAdd(k1, p22, k22) {
    const points = [this, p22];
    const coeffs = [k1, k22];
    return this._endoWnafMulAdd(points, coeffs, true);
  }
  /**
   * Checks if the Point instance is equal to another given Point.
   *
   * @method eq
   * @param p - The Point to be checked if equal to the current instance.
   *
   * @returns Whether the two Point instances are equal. Both the 'x' and 'y' coordinates have to match, and both points have to either be valid or at infinity for equality. If both conditions are true, it returns true, else it returns false.
   *
   * @example
   * const p1 = new Point(5, 20);
   * const p2 = new Point(5, 20);
   * const areEqual = p1.eq(p2); // returns true
   */
  eq(p5) {
    return this === p5 || this.inf === p5.inf && (this.inf || (this.x ?? new BigNumber(0)).cmp(p5.x ?? new BigNumber(0)) === 0 && (this.y ?? new BigNumber(0)).cmp(p5.y ?? new BigNumber(0)) === 0);
  }
  /**
   * Negate a point. The negation of a point P is the mirror of P about x-axis.
   *
   * @method neg
   *
   * @example
   * const P = new Point('123', '456');
   * const result = P.neg();
   */
  neg(_precompute) {
    if (this.inf) {
      return this;
    }
    const res = new _Point(this.x, (this.y ?? new BigNumber(0)).redNeg());
    if (_precompute === true && this.precomputed != null) {
      const pre = this.precomputed;
      const negate = (p5) => p5.neg();
      res.precomputed = {
        naf: pre.naf == null ? void 0 : {
          wnd: pre.naf.wnd,
          points: pre.naf.points.map(negate)
        },
        doubles: pre.doubles == null ? void 0 : {
          step: pre.doubles.step,
          points: pre.doubles.points.map((p5) => p5.neg())
        },
        beta: void 0
      };
    }
    return res;
  }
  /**
   * Performs the "doubling" operation on the Point a given number of times.
   * This is used in elliptic curve operations to perform multiplication by 2, multiple times.
   * If the point is at infinity, it simply returns the point because doubling
   * a point at infinity is still infinity.
   *
   * @method dblp
   * @param k - The number of times the "doubling" operation is to be performed on the Point.
   * @returns The Point after 'k' "doubling" operations have been performed.
   *
   * @example
   * const p = new Point(5, 20);
   * const doubledPoint = p.dblp(10); // returns the point after "doubled" 10 times
   */
  dblp(k4) {
    let r3 = this;
    for (let i = 0; i < k4; i++) {
      r3 = r3.dbl();
    }
    return r3;
  }
  /**
   * Converts the point to a Jacobian point. If the point is at infinity, the corresponding Jacobian point
   * will also be at infinity.
   *
   * @method toJ
   * @returns Returns a new Jacobian point based on the current point.
   *
   * @example
   * const point = new Point(xCoordinate, yCoordinate);
   * const jacobianPoint = point.toJ();
   */
  toJ() {
    if (this.inf) {
      return new JacobianPoint(null, null, null);
    }
    const res = new JacobianPoint(this.x, this.y, this.curve.one);
    return res;
  }
  _getBeta() {
    if (typeof this.curve.endo !== "object") {
      return;
    }
    const pre = this.precomputed;
    if (typeof pre === "object" && pre !== null && typeof pre.beta === "object" && pre.beta !== null) {
      return pre.beta;
    }
    const beta = new _Point((this.x ?? new BigNumber(0)).redMul(this.curve.endo.beta), this.y);
    if (pre != null) {
      const curve2 = this.curve;
      const endoMul = (p5) => {
        if (p5.x === null) {
          throw new Error("p.x is null");
        }
        if (curve2.endo === void 0 || curve2.endo === null) {
          throw new Error("curve.endo is undefined");
        }
        return new _Point(p5.x.redMul(curve2.endo.beta), p5.y);
      };
      pre.beta = beta;
      beta.precomputed = {
        beta: null,
        naf: pre.naf == null ? void 0 : {
          wnd: pre.naf.wnd,
          points: pre.naf.points.map(endoMul)
        },
        doubles: pre.doubles == null ? void 0 : {
          step: pre.doubles.step,
          points: pre.doubles.points.map(endoMul)
        }
      };
    }
    return beta;
  }
  _fixedNafMul(k4) {
    if (typeof this.precomputed !== "object" || this.precomputed === null) {
      throw new Error("_fixedNafMul requires precomputed values for the point");
    }
    const doubles = this._getDoubles();
    const naf = this.curve.getNAF(k4, 1, this.curve._bitLength);
    let I4 = (1 << doubles.step + 1) - (doubles.step % 2 === 0 ? 2 : 1);
    I4 /= 3;
    const repr = [];
    for (let j2 = 0; j2 < naf.length; j2 += doubles.step) {
      let nafW = 0;
      for (let k5 = j2 + doubles.step - 1; k5 >= j2; k5--) {
        nafW = (nafW << 1) + naf[k5];
      }
      repr.push(nafW);
    }
    let a4 = new JacobianPoint(null, null, null);
    let b5 = new JacobianPoint(null, null, null);
    for (let i = I4; i > 0; i--) {
      for (let j2 = 0; j2 < repr.length; j2++) {
        const nafW = repr[j2];
        if (nafW === i) {
          b5 = b5.mixedAdd(doubles.points[j2]);
        } else if (nafW === -i) {
          b5 = b5.mixedAdd(doubles.points[j2].neg());
        }
      }
      a4 = a4.add(b5);
    }
    return a4.toP();
  }
  _wnafMulAdd(defW, points, coeffs, len, jacobianResult) {
    const wndWidth = this.curve._wnafT1.map((num) => num.toNumber());
    const wnd = this.curve._wnafT2.map(() => []);
    const naf = this.curve._wnafT3.map(() => []);
    let max = 0;
    for (let i = 0; i < len; i++) {
      const p5 = points[i];
      const nafPoints = p5._getNAFPoints(defW);
      wndWidth[i] = nafPoints.wnd;
      wnd[i] = nafPoints.points;
    }
    for (let i = len - 1; i >= 1; i -= 2) {
      const a4 = i - 1;
      const b5 = i;
      if (wndWidth[a4] !== 1 || wndWidth[b5] !== 1) {
        naf[a4] = this.curve.getNAF(coeffs[a4], wndWidth[a4], this.curve._bitLength);
        naf[b5] = this.curve.getNAF(coeffs[b5], wndWidth[b5], this.curve._bitLength);
        max = Math.max(naf[a4].length, max);
        max = Math.max(naf[b5].length, max);
        continue;
      }
      const comb = [
        points[a4],
        null,
        null,
        points[b5]
        /* 7 */
      ];
      if ((points[a4].y ?? new BigNumber(0)).cmp(points[b5].y ?? new BigNumber(0)) === 0) {
        comb[1] = points[a4].add(points[b5]);
        comb[2] = points[a4].toJ().mixedAdd(points[b5].neg());
      } else if ((points[a4].y ?? new BigNumber(0)).cmp((points[b5].y ?? new BigNumber(0)).redNeg()) === 0) {
        comb[1] = points[a4].toJ().mixedAdd(points[b5]);
        comb[2] = points[a4].add(points[b5].neg());
      } else {
        comb[1] = points[a4].toJ().mixedAdd(points[b5]);
        comb[2] = points[a4].toJ().mixedAdd(points[b5].neg());
      }
      const index = [
        -3,
        -1,
        -5,
        -7,
        0,
        7,
        5,
        1,
        3
        /* 1 1 */
      ];
      const jsf = this.curve.getJSF(coeffs[a4], coeffs[b5]);
      max = Math.max(jsf[0].length, max);
      naf[a4] = new Array(max);
      naf[b5] = new Array(max);
      for (let j2 = 0; j2 < max; j2++) {
        const ja = Math.trunc(jsf[0][j2]);
        const jb = Math.trunc(jsf[1][j2]);
        naf[a4][j2] = index[(ja + 1) * 3 + (jb + 1)];
        naf[b5][j2] = 0;
        wnd[a4] = comb;
      }
    }
    let acc = new JacobianPoint(null, null, null);
    const tmp = this.curve._wnafT4;
    for (let i = max; i >= 0; i--) {
      let k4 = 0;
      while (i >= 0) {
        let zero = true;
        for (let j2 = 0; j2 < len; j2++) {
          tmp[j2] = new BigNumber(typeof naf[j2][i] === "number" ? naf[j2][i] : 0);
          if (!tmp[j2].isZero()) {
            zero = false;
          }
        }
        if (!zero) {
          break;
        }
        k4++;
        i--;
      }
      if (i >= 0) {
        k4++;
      }
      acc = acc.dblp(k4);
      if (i < 0) {
        break;
      }
      const one = new BigNumber(1);
      const two = new BigNumber(2);
      for (let j2 = 0; j2 < len; j2++) {
        const z2 = tmp[j2];
        let p5;
        if (z2.cmpn(0) === 0) {
          continue;
        } else if (z2.isNeg()) {
          p5 = wnd[j2][z2.neg().sub(one).div(two).toNumber()].neg();
        } else {
          p5 = wnd[j2][z2.sub(one).div(two).toNumber()];
        }
        if (p5.type === "affine") {
          acc = acc.mixedAdd(p5);
        } else {
          acc = acc.add(p5);
        }
      }
    }
    for (let i = 0; i < len; i++) {
      wnd[i] = [];
    }
    if (jacobianResult === true) {
      return acc;
    } else {
      return acc.toP();
    }
  }
  _endoWnafMulAdd(points, coeffs, jacobianResult) {
    const npoints = new Array(points.length * 2);
    const ncoeffs = new Array(points.length * 2);
    let i;
    for (i = 0; i < points.length; i++) {
      const split2 = this.curve._endoSplit(coeffs[i]);
      let p5 = points[i];
      let beta = p5._getBeta() ?? new _Point(null, null);
      if (split2.k1.negative !== 0) {
        split2.k1.ineg();
        p5 = p5.neg(true);
      }
      if (split2.k2.negative !== 0) {
        split2.k2.ineg();
        beta = beta.neg(true);
      }
      npoints[i * 2] = p5;
      npoints[i * 2 + 1] = beta;
      ncoeffs[i * 2] = split2.k1;
      ncoeffs[i * 2 + 1] = split2.k2;
    }
    const res = this._wnafMulAdd(1, npoints, ncoeffs, i * 2, jacobianResult);
    for (let j2 = 0; j2 < i * 2; j2++) {
      npoints[j2] = null;
      ncoeffs[j2] = null;
    }
    return res;
  }
  _hasDoubles(k4) {
    if (this.precomputed == null) {
      return false;
    }
    const doubles = this.precomputed.doubles;
    if (typeof doubles !== "object") {
      return false;
    }
    return doubles.points.length >= Math.ceil((k4.bitLength() + 1) / doubles.step);
  }
  _getDoubles(step, power) {
    if (typeof this.precomputed === "object" && this.precomputed !== null && typeof this.precomputed.doubles === "object" && this.precomputed.doubles !== null) {
      return this.precomputed.doubles;
    }
    const doubles = [this];
    let acc = this;
    for (let i = 0; i < (power ?? 0); i += step ?? 1) {
      for (let j2 = 0; j2 < (step ?? 1); j2++) {
        acc = acc.dbl();
      }
      doubles.push(acc);
    }
    return {
      step: step ?? 1,
      points: doubles
    };
  }
  _getNAFPoints(wnd) {
    if (typeof this.precomputed === "object" && this.precomputed !== null && typeof this.precomputed.naf === "object" && this.precomputed.naf !== null) {
      return this.precomputed.naf;
    }
    const res = [this];
    const max = (1 << wnd) - 1;
    const dbl = max === 1 ? null : this.dbl();
    for (let i = 1; i < max; i++) {
      if (dbl !== null) {
        res[i] = res[i - 1].add(dbl);
      }
    }
    return {
      wnd,
      points: res
    };
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/Curve.js
var globalCurve;
var Curve = class _Curve {
  p;
  red;
  redN;
  zero;
  one;
  two;
  g;
  n;
  a;
  b;
  tinv;
  zeroA;
  threeA;
  endo;
  // beta, lambda, basis
  _endoWnafT1;
  _endoWnafT2;
  _wnafT1;
  _wnafT2;
  _wnafT3;
  _wnafT4;
  _bitLength;
  // Represent num in a w-NAF form
  static assert(expression, message = "Elliptic curve assertion failed") {
    if (!expression) {
      throw new Error(message);
    }
  }
  getNAF(num, w3, bits) {
    const naf = new Array(Math.max(num.bitLength(), bits) + 1);
    naf.fill(0);
    const ws = 1 << w3 + 1;
    const k4 = num.clone();
    for (let i = 0; i < naf.length; i++) {
      let z2;
      const mod = k4.andln(ws - 1);
      if (k4.isOdd()) {
        if (mod > (ws >> 1) - 1) {
          z2 = (ws >> 1) - mod;
        } else {
          z2 = mod;
        }
        k4.isubn(z2);
      } else {
        z2 = 0;
      }
      naf[i] = z2;
      k4.iushrn(1);
    }
    return naf;
  }
  // Represent k1, k2 in a Joint Sparse Form
  getJSF(k1, k22) {
    const jsf = [[], []];
    k1 = k1.clone();
    k22 = k22.clone();
    let d1 = 0;
    let d22 = 0;
    while (k1.cmpn(-d1) > 0 || k22.cmpn(-d22) > 0) {
      let m14 = k1.andln(3) + d1 & 3;
      let m24 = k22.andln(3) + d22 & 3;
      if (m14 === 3) {
        m14 = -1;
      }
      if (m24 === 3) {
        m24 = -1;
      }
      let u1;
      if ((m14 & 1) === 0) {
        u1 = 0;
      } else {
        const m8 = k1.andln(7) + d1 & 7;
        if ((m8 === 3 || m8 === 5) && m24 === 2) {
          u1 = -m14;
        } else {
          u1 = m14;
        }
      }
      jsf[0].push(u1);
      let u22;
      if ((m24 & 1) === 0) {
        u22 = 0;
      } else {
        const m8 = k22.andln(7) + d22 & 7;
        if ((m8 === 3 || m8 === 5) && m14 === 2) {
          u22 = -m24;
        } else {
          u22 = m24;
        }
      }
      jsf[1].push(u22);
      if (2 * d1 === u1 + 1) {
        d1 = 1 - d1;
      }
      if (2 * d22 === u22 + 1) {
        d22 = 1 - d22;
      }
      k1.iushrn(1);
      k22.iushrn(1);
    }
    return jsf;
  }
  static cachedProperty(obj, name, computer) {
    const key = "_" + name;
    obj.prototype[name] = function cachedProperty() {
      if (this[key] === void 0) {
        this[key] = computer.call(this);
      }
      return this[key];
    };
  }
  static parseBytes(bytes2) {
    return typeof bytes2 === "string" ? toArray2(bytes2, "hex") : bytes2;
  }
  static intFromLE(bytes2) {
    return new BigNumber(bytes2, "hex", "le");
  }
  constructor() {
    if (globalCurve === void 0) {
      globalCurve = this;
    } else {
      return globalCurve;
    }
    const precomputed = {
      doubles: {
        step: 4,
        points: [
          [
            "e60fce93b59e9ec53011aabc21c23e97b2a31369b87a5ae9c44ee89e2a6dec0a",
            "f7e3507399e595929db99f34f57937101296891e44d23f0be1f32cce69616821"
          ],
          [
            "8282263212c609d9ea2a6e3e172de238d8c39cabd5ac1ca10646e23fd5f51508",
            "11f8a8098557dfe45e8256e830b60ace62d613ac2f7b17bed31b6eaff6e26caf"
          ],
          [
            "175e159f728b865a72f99cc6c6fc846de0b93833fd2222ed73fce5b551e5b739",
            "d3506e0d9e3c79eba4ef97a51ff71f5eacb5955add24345c6efa6ffee9fed695"
          ],
          [
            "363d90d447b00c9c99ceac05b6262ee053441c7e55552ffe526bad8f83ff4640",
            "4e273adfc732221953b445397f3363145b9a89008199ecb62003c7f3bee9de9"
          ],
          [
            "8b4b5f165df3c2be8c6244b5b745638843e4a781a15bcd1b69f79a55dffdf80c",
            "4aad0a6f68d308b4b3fbd7813ab0da04f9e336546162ee56b3eff0c65fd4fd36"
          ],
          [
            "723cbaa6e5db996d6bf771c00bd548c7b700dbffa6c0e77bcb6115925232fcda",
            "96e867b5595cc498a921137488824d6e2660a0653779494801dc069d9eb39f5f"
          ],
          [
            "eebfa4d493bebf98ba5feec812c2d3b50947961237a919839a533eca0e7dd7fa",
            "5d9a8ca3970ef0f269ee7edaf178089d9ae4cdc3a711f712ddfd4fdae1de8999"
          ],
          [
            "100f44da696e71672791d0a09b7bde459f1215a29b3c03bfefd7835b39a48db0",
            "cdd9e13192a00b772ec8f3300c090666b7ff4a18ff5195ac0fbd5cd62bc65a09"
          ],
          [
            "e1031be262c7ed1b1dc9227a4a04c017a77f8d4464f3b3852c8acde6e534fd2d",
            "9d7061928940405e6bb6a4176597535af292dd419e1ced79a44f18f29456a00d"
          ],
          [
            "feea6cae46d55b530ac2839f143bd7ec5cf8b266a41d6af52d5e688d9094696d",
            "e57c6b6c97dce1bab06e4e12bf3ecd5c981c8957cc41442d3155debf18090088"
          ],
          [
            "da67a91d91049cdcb367be4be6ffca3cfeed657d808583de33fa978bc1ec6cb1",
            "9bacaa35481642bc41f463f7ec9780e5dec7adc508f740a17e9ea8e27a68be1d"
          ],
          [
            "53904faa0b334cdda6e000935ef22151ec08d0f7bb11069f57545ccc1a37b7c0",
            "5bc087d0bc80106d88c9eccac20d3c1c13999981e14434699dcb096b022771c8"
          ],
          [
            "8e7bcd0bd35983a7719cca7764ca906779b53a043a9b8bcaeff959f43ad86047",
            "10b7770b2a3da4b3940310420ca9514579e88e2e47fd68b3ea10047e8460372a"
          ],
          [
            "385eed34c1cdff21e6d0818689b81bde71a7f4f18397e6690a841e1599c43862",
            "283bebc3e8ea23f56701de19e9ebf4576b304eec2086dc8cc0458fe5542e5453"
          ],
          [
            "6f9d9b803ecf191637c73a4413dfa180fddf84a5947fbc9c606ed86c3fac3a7",
            "7c80c68e603059ba69b8e2a30e45c4d47ea4dd2f5c281002d86890603a842160"
          ],
          [
            "3322d401243c4e2582a2147c104d6ecbf774d163db0f5e5313b7e0e742d0e6bd",
            "56e70797e9664ef5bfb019bc4ddaf9b72805f63ea2873af624f3a2e96c28b2a0"
          ],
          [
            "85672c7d2de0b7da2bd1770d89665868741b3f9af7643397721d74d28134ab83",
            "7c481b9b5b43b2eb6374049bfa62c2e5e77f17fcc5298f44c8e3094f790313a6"
          ],
          [
            "948bf809b1988a46b06c9f1919413b10f9226c60f668832ffd959af60c82a0a",
            "53a562856dcb6646dc6b74c5d1c3418c6d4dff08c97cd2bed4cb7f88d8c8e589"
          ],
          [
            "6260ce7f461801c34f067ce0f02873a8f1b0e44dfc69752accecd819f38fd8e8",
            "bc2da82b6fa5b571a7f09049776a1ef7ecd292238051c198c1a84e95b2b4ae17"
          ],
          [
            "e5037de0afc1d8d43d8348414bbf4103043ec8f575bfdc432953cc8d2037fa2d",
            "4571534baa94d3b5f9f98d09fb990bddbd5f5b03ec481f10e0e5dc841d755bda"
          ],
          [
            "e06372b0f4a207adf5ea905e8f1771b4e7e8dbd1c6a6c5b725866a0ae4fce725",
            "7a908974bce18cfe12a27bb2ad5a488cd7484a7787104870b27034f94eee31dd"
          ],
          [
            "213c7a715cd5d45358d0bbf9dc0ce02204b10bdde2a3f58540ad6908d0559754",
            "4b6dad0b5ae462507013ad06245ba190bb4850f5f36a7eeddff2c27534b458f2"
          ],
          [
            "4e7c272a7af4b34e8dbb9352a5419a87e2838c70adc62cddf0cc3a3b08fbd53c",
            "17749c766c9d0b18e16fd09f6def681b530b9614bff7dd33e0b3941817dcaae6"
          ],
          [
            "fea74e3dbe778b1b10f238ad61686aa5c76e3db2be43057632427e2840fb27b6",
            "6e0568db9b0b13297cf674deccb6af93126b596b973f7b77701d3db7f23cb96f"
          ],
          [
            "76e64113f677cf0e10a2570d599968d31544e179b760432952c02a4417bdde39",
            "c90ddf8dee4e95cf577066d70681f0d35e2a33d2b56d2032b4b1752d1901ac01"
          ],
          [
            "c738c56b03b2abe1e8281baa743f8f9a8f7cc643df26cbee3ab150242bcbb891",
            "893fb578951ad2537f718f2eacbfbbbb82314eef7880cfe917e735d9699a84c3"
          ],
          [
            "d895626548b65b81e264c7637c972877d1d72e5f3a925014372e9f6588f6c14b",
            "febfaa38f2bc7eae728ec60818c340eb03428d632bb067e179363ed75d7d991f"
          ],
          [
            "b8da94032a957518eb0f6433571e8761ceffc73693e84edd49150a564f676e03",
            "2804dfa44805a1e4d7c99cc9762808b092cc584d95ff3b511488e4e74efdf6e7"
          ],
          [
            "e80fea14441fb33a7d8adab9475d7fab2019effb5156a792f1a11778e3c0df5d",
            "eed1de7f638e00771e89768ca3ca94472d155e80af322ea9fcb4291b6ac9ec78"
          ],
          [
            "a301697bdfcd704313ba48e51d567543f2a182031efd6915ddc07bbcc4e16070",
            "7370f91cfb67e4f5081809fa25d40f9b1735dbf7c0a11a130c0d1a041e177ea1"
          ],
          [
            "90ad85b389d6b936463f9d0512678de208cc330b11307fffab7ac63e3fb04ed4",
            "e507a3620a38261affdcbd9427222b839aefabe1582894d991d4d48cb6ef150"
          ],
          [
            "8f68b9d2f63b5f339239c1ad981f162ee88c5678723ea3351b7b444c9ec4c0da",
            "662a9f2dba063986de1d90c2b6be215dbbea2cfe95510bfdf23cbf79501fff82"
          ],
          [
            "e4f3fb0176af85d65ff99ff9198c36091f48e86503681e3e6686fd5053231e11",
            "1e63633ad0ef4f1c1661a6d0ea02b7286cc7e74ec951d1c9822c38576feb73bc"
          ],
          [
            "8c00fa9b18ebf331eb961537a45a4266c7034f2f0d4e1d0716fb6eae20eae29e",
            "efa47267fea521a1a9dc343a3736c974c2fadafa81e36c54e7d2a4c66702414b"
          ],
          [
            "e7a26ce69dd4829f3e10cec0a9e98ed3143d084f308b92c0997fddfc60cb3e41",
            "2a758e300fa7984b471b006a1aafbb18d0a6b2c0420e83e20e8a9421cf2cfd51"
          ],
          [
            "b6459e0ee3662ec8d23540c223bcbdc571cbcb967d79424f3cf29eb3de6b80ef",
            "67c876d06f3e06de1dadf16e5661db3c4b3ae6d48e35b2ff30bf0b61a71ba45"
          ],
          [
            "d68a80c8280bb840793234aa118f06231d6f1fc67e73c5a5deda0f5b496943e8",
            "db8ba9fff4b586d00c4b1f9177b0e28b5b0e7b8f7845295a294c84266b133120"
          ],
          [
            "324aed7df65c804252dc0270907a30b09612aeb973449cea4095980fc28d3d5d",
            "648a365774b61f2ff130c0c35aec1f4f19213b0c7e332843967224af96ab7c84"
          ],
          [
            "4df9c14919cde61f6d51dfdbe5fee5dceec4143ba8d1ca888e8bd373fd054c96",
            "35ec51092d8728050974c23a1d85d4b5d506cdc288490192ebac06cad10d5d"
          ],
          [
            "9c3919a84a474870faed8a9c1cc66021523489054d7f0308cbfc99c8ac1f98cd",
            "ddb84f0f4a4ddd57584f044bf260e641905326f76c64c8e6be7e5e03d4fc599d"
          ],
          [
            "6057170b1dd12fdf8de05f281d8e06bb91e1493a8b91d4cc5a21382120a959e5",
            "9a1af0b26a6a4807add9a2daf71df262465152bc3ee24c65e899be932385a2a8"
          ],
          [
            "a576df8e23a08411421439a4518da31880cef0fba7d4df12b1a6973eecb94266",
            "40a6bf20e76640b2c92b97afe58cd82c432e10a7f514d9f3ee8be11ae1b28ec8"
          ],
          [
            "7778a78c28dec3e30a05fe9629de8c38bb30d1f5cf9a3a208f763889be58ad71",
            "34626d9ab5a5b22ff7098e12f2ff580087b38411ff24ac563b513fc1fd9f43ac"
          ],
          [
            "928955ee637a84463729fd30e7afd2ed5f96274e5ad7e5cb09eda9c06d903ac",
            "c25621003d3f42a827b78a13093a95eeac3d26efa8a8d83fc5180e935bcd091f"
          ],
          [
            "85d0fef3ec6db109399064f3a0e3b2855645b4a907ad354527aae75163d82751",
            "1f03648413a38c0be29d496e582cf5663e8751e96877331582c237a24eb1f962"
          ],
          [
            "ff2b0dce97eece97c1c9b6041798b85dfdfb6d8882da20308f5404824526087e",
            "493d13fef524ba188af4c4dc54d07936c7b7ed6fb90e2ceb2c951e01f0c29907"
          ],
          [
            "827fbbe4b1e880ea9ed2b2e6301b212b57f1ee148cd6dd28780e5e2cf856e241",
            "c60f9c923c727b0b71bef2c67d1d12687ff7a63186903166d605b68baec293ec"
          ],
          [
            "eaa649f21f51bdbae7be4ae34ce6e5217a58fdce7f47f9aa7f3b58fa2120e2b3",
            "be3279ed5bbbb03ac69a80f89879aa5a01a6b965f13f7e59d47a5305ba5ad93d"
          ],
          [
            "e4a42d43c5cf169d9391df6decf42ee541b6d8f0c9a137401e23632dda34d24f",
            "4d9f92e716d1c73526fc99ccfb8ad34ce886eedfa8d8e4f13a7f7131deba9414"
          ],
          [
            "1ec80fef360cbdd954160fadab352b6b92b53576a88fea4947173b9d4300bf19",
            "aeefe93756b5340d2f3a4958a7abbf5e0146e77f6295a07b671cdc1cc107cefd"
          ],
          [
            "146a778c04670c2f91b00af4680dfa8bce3490717d58ba889ddb5928366642be",
            "b318e0ec3354028add669827f9d4b2870aaa971d2f7e5ed1d0b297483d83efd0"
          ],
          [
            "fa50c0f61d22e5f07e3acebb1aa07b128d0012209a28b9776d76a8793180eef9",
            "6b84c6922397eba9b72cd2872281a68a5e683293a57a213b38cd8d7d3f4f2811"
          ],
          [
            "da1d61d0ca721a11b1a5bf6b7d88e8421a288ab5d5bba5220e53d32b5f067ec2",
            "8157f55a7c99306c79c0766161c91e2966a73899d279b48a655fba0f1ad836f1"
          ],
          [
            "a8e282ff0c9706907215ff98e8fd416615311de0446f1e062a73b0610d064e13",
            "7f97355b8db81c09abfb7f3c5b2515888b679a3e50dd6bd6cef7c73111f4cc0c"
          ],
          [
            "174a53b9c9a285872d39e56e6913cab15d59b1fa512508c022f382de8319497c",
            "ccc9dc37abfc9c1657b4155f2c47f9e6646b3a1d8cb9854383da13ac079afa73"
          ],
          [
            "959396981943785c3d3e57edf5018cdbe039e730e4918b3d884fdff09475b7ba",
            "2e7e552888c331dd8ba0386a4b9cd6849c653f64c8709385e9b8abf87524f2fd"
          ],
          [
            "d2a63a50ae401e56d645a1153b109a8fcca0a43d561fba2dbb51340c9d82b151",
            "e82d86fb6443fcb7565aee58b2948220a70f750af484ca52d4142174dcf89405"
          ],
          [
            "64587e2335471eb890ee7896d7cfdc866bacbdbd3839317b3436f9b45617e073",
            "d99fcdd5bf6902e2ae96dd6447c299a185b90a39133aeab358299e5e9faf6589"
          ],
          [
            "8481bde0e4e4d885b3a546d3e549de042f0aa6cea250e7fd358d6c86dd45e458",
            "38ee7b8cba5404dd84a25bf39cecb2ca900a79c42b262e556d64b1b59779057e"
          ],
          [
            "13464a57a78102aa62b6979ae817f4637ffcfed3c4b1ce30bcd6303f6caf666b",
            "69be159004614580ef7e433453ccb0ca48f300a81d0942e13f495a907f6ecc27"
          ],
          [
            "bc4a9df5b713fe2e9aef430bcc1dc97a0cd9ccede2f28588cada3a0d2d83f366",
            "d3a81ca6e785c06383937adf4b798caa6e8a9fbfa547b16d758d666581f33c1"
          ],
          [
            "8c28a97bf8298bc0d23d8c749452a32e694b65e30a9472a3954ab30fe5324caa",
            "40a30463a3305193378fedf31f7cc0eb7ae784f0451cb9459e71dc73cbef9482"
          ],
          [
            "8ea9666139527a8c1dd94ce4f071fd23c8b350c5a4bb33748c4ba111faccae0",
            "620efabbc8ee2782e24e7c0cfb95c5d735b783be9cf0f8e955af34a30e62b945"
          ],
          [
            "dd3625faef5ba06074669716bbd3788d89bdde815959968092f76cc4eb9a9787",
            "7a188fa3520e30d461da2501045731ca941461982883395937f68d00c644a573"
          ],
          [
            "f710d79d9eb962297e4f6232b40e8f7feb2bc63814614d692c12de752408221e",
            "ea98e67232d3b3295d3b535532115ccac8612c721851617526ae47a9c77bfc82"
          ]
        ]
      },
      naf: {
        wnd: 7,
        points: [
          [
            "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
            "388f7b0f632de8140fe337e62a37f3566500a99934c2231b6cb9fd7584b8e672"
          ],
          [
            "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4",
            "d8ac222636e5e3d6d4dba9dda6c9c426f788271bab0d6840dca87d3aa6ac62d6"
          ],
          [
            "5cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc",
            "6aebca40ba255960a3178d6d861a54dba813d0b813fde7b5a5082628087264da"
          ],
          [
            "acd484e2f0c7f65309ad178a9f559abde09796974c57e714c35f110dfc27ccbe",
            "cc338921b0a7d9fd64380971763b61e9add888a4375f8e0f05cc262ac64f9c37"
          ],
          [
            "774ae7f858a9411e5ef4246b70c65aac5649980be5c17891bbec17895da008cb",
            "d984a032eb6b5e190243dd56d7b7b365372db1e2dff9d6a8301d74c9c953c61b"
          ],
          [
            "f28773c2d975288bc7d1d205c3748651b075fbc6610e58cddeeddf8f19405aa8",
            "ab0902e8d880a89758212eb65cdaf473a1a06da521fa91f29b5cb52db03ed81"
          ],
          [
            "d7924d4f7d43ea965a465ae3095ff41131e5946f3c85f79e44adbcf8e27e080e",
            "581e2872a86c72a683842ec228cc6defea40af2bd896d3a5c504dc9ff6a26b58"
          ],
          [
            "defdea4cdb677750a420fee807eacf21eb9898ae79b9768766e4faa04a2d4a34",
            "4211ab0694635168e997b0ead2a93daeced1f4a04a95c0f6cfb199f69e56eb77"
          ],
          [
            "2b4ea0a797a443d293ef5cff444f4979f06acfebd7e86d277475656138385b6c",
            "85e89bc037945d93b343083b5a1c86131a01f60c50269763b570c854e5c09b7a"
          ],
          [
            "352bbf4a4cdd12564f93fa332ce333301d9ad40271f8107181340aef25be59d5",
            "321eb4075348f534d59c18259dda3e1f4a1b3b2e71b1039c67bd3d8bcf81998c"
          ],
          [
            "2fa2104d6b38d11b0230010559879124e42ab8dfeff5ff29dc9cdadd4ecacc3f",
            "2de1068295dd865b64569335bd5dd80181d70ecfc882648423ba76b532b7d67"
          ],
          [
            "9248279b09b4d68dab21a9b066edda83263c3d84e09572e269ca0cd7f5453714",
            "73016f7bf234aade5d1aa71bdea2b1ff3fc0de2a887912ffe54a32ce97cb3402"
          ],
          [
            "daed4f2be3a8bf278e70132fb0beb7522f570e144bf615c07e996d443dee8729",
            "a69dce4a7d6c98e8d4a1aca87ef8d7003f83c230f3afa726ab40e52290be1c55"
          ],
          [
            "c44d12c7065d812e8acf28d7cbb19f9011ecd9e9fdf281b0e6a3b5e87d22e7db",
            "2119a460ce326cdc76c45926c982fdac0e106e861edf61c5a039063f0e0e6482"
          ],
          [
            "6a245bf6dc698504c89a20cfded60853152b695336c28063b61c65cbd269e6b4",
            "e022cf42c2bd4a708b3f5126f16a24ad8b33ba48d0423b6efd5e6348100d8a82"
          ],
          [
            "1697ffa6fd9de627c077e3d2fe541084ce13300b0bec1146f95ae57f0d0bd6a5",
            "b9c398f186806f5d27561506e4557433a2cf15009e498ae7adee9d63d01b2396"
          ],
          [
            "605bdb019981718b986d0f07e834cb0d9deb8360ffb7f61df982345ef27a7479",
            "2972d2de4f8d20681a78d93ec96fe23c26bfae84fb14db43b01e1e9056b8c49"
          ],
          [
            "62d14dab4150bf497402fdc45a215e10dcb01c354959b10cfe31c7e9d87ff33d",
            "80fc06bd8cc5b01098088a1950eed0db01aa132967ab472235f5642483b25eaf"
          ],
          [
            "80c60ad0040f27dade5b4b06c408e56b2c50e9f56b9b8b425e555c2f86308b6f",
            "1c38303f1cc5c30f26e66bad7fe72f70a65eed4cbe7024eb1aa01f56430bd57a"
          ],
          [
            "7a9375ad6167ad54aa74c6348cc54d344cc5dc9487d847049d5eabb0fa03c8fb",
            "d0e3fa9eca8726909559e0d79269046bdc59ea10c70ce2b02d499ec224dc7f7"
          ],
          [
            "d528ecd9b696b54c907a9ed045447a79bb408ec39b68df504bb51f459bc3ffc9",
            "eecf41253136e5f99966f21881fd656ebc4345405c520dbc063465b521409933"
          ],
          [
            "49370a4b5f43412ea25f514e8ecdad05266115e4a7ecb1387231808f8b45963",
            "758f3f41afd6ed428b3081b0512fd62a54c3f3afbb5b6764b653052a12949c9a"
          ],
          [
            "77f230936ee88cbbd73df930d64702ef881d811e0e1498e2f1c13eb1fc345d74",
            "958ef42a7886b6400a08266e9ba1b37896c95330d97077cbbe8eb3c7671c60d6"
          ],
          [
            "f2dac991cc4ce4b9ea44887e5c7c0bce58c80074ab9d4dbaeb28531b7739f530",
            "e0dedc9b3b2f8dad4da1f32dec2531df9eb5fbeb0598e4fd1a117dba703a3c37"
          ],
          [
            "463b3d9f662621fb1b4be8fbbe2520125a216cdfc9dae3debcba4850c690d45b",
            "5ed430d78c296c3543114306dd8622d7c622e27c970a1de31cb377b01af7307e"
          ],
          [
            "f16f804244e46e2a09232d4aff3b59976b98fac14328a2d1a32496b49998f247",
            "cedabd9b82203f7e13d206fcdf4e33d92a6c53c26e5cce26d6579962c4e31df6"
          ],
          [
            "caf754272dc84563b0352b7a14311af55d245315ace27c65369e15f7151d41d1",
            "cb474660ef35f5f2a41b643fa5e460575f4fa9b7962232a5c32f908318a04476"
          ],
          [
            "2600ca4b282cb986f85d0f1709979d8b44a09c07cb86d7c124497bc86f082120",
            "4119b88753c15bd6a693b03fcddbb45d5ac6be74ab5f0ef44b0be9475a7e4b40"
          ],
          [
            "7635ca72d7e8432c338ec53cd12220bc01c48685e24f7dc8c602a7746998e435",
            "91b649609489d613d1d5e590f78e6d74ecfc061d57048bad9e76f302c5b9c61"
          ],
          [
            "754e3239f325570cdbbf4a87deee8a66b7f2b33479d468fbc1a50743bf56cc18",
            "673fb86e5bda30fb3cd0ed304ea49a023ee33d0197a695d0c5d98093c536683"
          ],
          [
            "e3e6bd1071a1e96aff57859c82d570f0330800661d1c952f9fe2694691d9b9e8",
            "59c9e0bba394e76f40c0aa58379a3cb6a5a2283993e90c4167002af4920e37f5"
          ],
          [
            "186b483d056a033826ae73d88f732985c4ccb1f32ba35f4b4cc47fdcf04aa6eb",
            "3b952d32c67cf77e2e17446e204180ab21fb8090895138b4a4a797f86e80888b"
          ],
          [
            "df9d70a6b9876ce544c98561f4be4f725442e6d2b737d9c91a8321724ce0963f",
            "55eb2dafd84d6ccd5f862b785dc39d4ab157222720ef9da217b8c45cf2ba2417"
          ],
          [
            "5edd5cc23c51e87a497ca815d5dce0f8ab52554f849ed8995de64c5f34ce7143",
            "efae9c8dbc14130661e8cec030c89ad0c13c66c0d17a2905cdc706ab7399a868"
          ],
          [
            "290798c2b6476830da12fe02287e9e777aa3fba1c355b17a722d362f84614fba",
            "e38da76dcd440621988d00bcf79af25d5b29c094db2a23146d003afd41943e7a"
          ],
          [
            "af3c423a95d9f5b3054754efa150ac39cd29552fe360257362dfdecef4053b45",
            "f98a3fd831eb2b749a93b0e6f35cfb40c8cd5aa667a15581bc2feded498fd9c6"
          ],
          [
            "766dbb24d134e745cccaa28c99bf274906bb66b26dcf98df8d2fed50d884249a",
            "744b1152eacbe5e38dcc887980da38b897584a65fa06cedd2c924f97cbac5996"
          ],
          [
            "59dbf46f8c94759ba21277c33784f41645f7b44f6c596a58ce92e666191abe3e",
            "c534ad44175fbc300f4ea6ce648309a042ce739a7919798cd85e216c4a307f6e"
          ],
          [
            "f13ada95103c4537305e691e74e9a4a8dd647e711a95e73cb62dc6018cfd87b8",
            "e13817b44ee14de663bf4bc808341f326949e21a6a75c2570778419bdaf5733d"
          ],
          [
            "7754b4fa0e8aced06d4167a2c59cca4cda1869c06ebadfb6488550015a88522c",
            "30e93e864e669d82224b967c3020b8fa8d1e4e350b6cbcc537a48b57841163a2"
          ],
          [
            "948dcadf5990e048aa3874d46abef9d701858f95de8041d2a6828c99e2262519",
            "e491a42537f6e597d5d28a3224b1bc25df9154efbd2ef1d2cbba2cae5347d57e"
          ],
          [
            "7962414450c76c1689c7b48f8202ec37fb224cf5ac0bfa1570328a8a3d7c77ab",
            "100b610ec4ffb4760d5c1fc133ef6f6b12507a051f04ac5760afa5b29db83437"
          ],
          [
            "3514087834964b54b15b160644d915485a16977225b8847bb0dd085137ec47ca",
            "ef0afbb2056205448e1652c48e8127fc6039e77c15c2378b7e7d15a0de293311"
          ],
          [
            "d3cc30ad6b483e4bc79ce2c9dd8bc54993e947eb8df787b442943d3f7b527eaf",
            "8b378a22d827278d89c5e9be8f9508ae3c2ad46290358630afb34db04eede0a4"
          ],
          [
            "1624d84780732860ce1c78fcbfefe08b2b29823db913f6493975ba0ff4847610",
            "68651cf9b6da903e0914448c6cd9d4ca896878f5282be4c8cc06e2a404078575"
          ],
          [
            "733ce80da955a8a26902c95633e62a985192474b5af207da6df7b4fd5fc61cd4",
            "f5435a2bd2badf7d485a4d8b8db9fcce3e1ef8e0201e4578c54673bc1dc5ea1d"
          ],
          [
            "15d9441254945064cf1a1c33bbd3b49f8966c5092171e699ef258dfab81c045c",
            "d56eb30b69463e7234f5137b73b84177434800bacebfc685fc37bbe9efe4070d"
          ],
          [
            "a1d0fcf2ec9de675b612136e5ce70d271c21417c9d2b8aaaac138599d0717940",
            "edd77f50bcb5a3cab2e90737309667f2641462a54070f3d519212d39c197a629"
          ],
          [
            "e22fbe15c0af8ccc5780c0735f84dbe9a790badee8245c06c7ca37331cb36980",
            "a855babad5cd60c88b430a69f53a1a7a38289154964799be43d06d77d31da06"
          ],
          [
            "311091dd9860e8e20ee13473c1155f5f69635e394704eaa74009452246cfa9b3",
            "66db656f87d1f04fffd1f04788c06830871ec5a64feee685bd80f0b1286d8374"
          ],
          [
            "34c1fd04d301be89b31c0442d3e6ac24883928b45a9340781867d4232ec2dbdf",
            "9414685e97b1b5954bd46f730174136d57f1ceeb487443dc5321857ba73abee"
          ],
          [
            "f219ea5d6b54701c1c14de5b557eb42a8d13f3abbcd08affcc2a5e6b049b8d63",
            "4cb95957e83d40b0f73af4544cccf6b1f4b08d3c07b27fb8d8c2962a400766d1"
          ],
          [
            "d7b8740f74a8fbaab1f683db8f45de26543a5490bca627087236912469a0b448",
            "fa77968128d9c92ee1010f337ad4717eff15db5ed3c049b3411e0315eaa4593b"
          ],
          [
            "32d31c222f8f6f0ef86f7c98d3a3335ead5bcd32abdd94289fe4d3091aa824bf",
            "5f3032f5892156e39ccd3d7915b9e1da2e6dac9e6f26e961118d14b8462e1661"
          ],
          [
            "7461f371914ab32671045a155d9831ea8793d77cd59592c4340f86cbc18347b5",
            "8ec0ba238b96bec0cbdddcae0aa442542eee1ff50c986ea6b39847b3cc092ff6"
          ],
          [
            "ee079adb1df1860074356a25aa38206a6d716b2c3e67453d287698bad7b2b2d6",
            "8dc2412aafe3be5c4c5f37e0ecc5f9f6a446989af04c4e25ebaac479ec1c8c1e"
          ],
          [
            "16ec93e447ec83f0467b18302ee620f7e65de331874c9dc72bfd8616ba9da6b5",
            "5e4631150e62fb40d0e8c2a7ca5804a39d58186a50e497139626778e25b0674d"
          ],
          [
            "eaa5f980c245f6f038978290afa70b6bd8855897f98b6aa485b96065d537bd99",
            "f65f5d3e292c2e0819a528391c994624d784869d7e6ea67fb18041024edc07dc"
          ],
          [
            "78c9407544ac132692ee1910a02439958ae04877151342ea96c4b6b35a49f51",
            "f3e0319169eb9b85d5404795539a5e68fa1fbd583c064d2462b675f194a3ddb4"
          ],
          [
            "494f4be219a1a77016dcd838431aea0001cdc8ae7a6fc688726578d9702857a5",
            "42242a969283a5f339ba7f075e36ba2af925ce30d767ed6e55f4b031880d562c"
          ],
          [
            "a598a8030da6d86c6bc7f2f5144ea549d28211ea58faa70ebf4c1e665c1fe9b5",
            "204b5d6f84822c307e4b4a7140737aec23fc63b65b35f86a10026dbd2d864e6b"
          ],
          [
            "c41916365abb2b5d09192f5f2dbeafec208f020f12570a184dbadc3e58595997",
            "4f14351d0087efa49d245b328984989d5caf9450f34bfc0ed16e96b58fa9913"
          ],
          [
            "841d6063a586fa475a724604da03bc5b92a2e0d2e0a36acfe4c73a5514742881",
            "73867f59c0659e81904f9a1c7543698e62562d6744c169ce7a36de01a8d6154"
          ],
          [
            "5e95bb399a6971d376026947f89bde2f282b33810928be4ded112ac4d70e20d5",
            "39f23f366809085beebfc71181313775a99c9aed7d8ba38b161384c746012865"
          ],
          [
            "36e4641a53948fd476c39f8a99fd974e5ec07564b5315d8bf99471bca0ef2f66",
            "d2424b1b1abe4eb8164227b085c9aa9456ea13493fd563e06fd51cf5694c78fc"
          ],
          [
            "336581ea7bfbbb290c191a2f507a41cf5643842170e914faeab27c2c579f726",
            "ead12168595fe1be99252129b6e56b3391f7ab1410cd1e0ef3dcdcabd2fda224"
          ],
          [
            "8ab89816dadfd6b6a1f2634fcf00ec8403781025ed6890c4849742706bd43ede",
            "6fdcef09f2f6d0a044e654aef624136f503d459c3e89845858a47a9129cdd24e"
          ],
          [
            "1e33f1a746c9c5778133344d9299fcaa20b0938e8acff2544bb40284b8c5fb94",
            "60660257dd11b3aa9c8ed618d24edff2306d320f1d03010e33a7d2057f3b3b6"
          ],
          [
            "85b7c1dcb3cec1b7ee7f30ded79dd20a0ed1f4cc18cbcfcfa410361fd8f08f31",
            "3d98a9cdd026dd43f39048f25a8847f4fcafad1895d7a633c6fed3c35e999511"
          ],
          [
            "29df9fbd8d9e46509275f4b125d6d45d7fbe9a3b878a7af872a2800661ac5f51",
            "b4c4fe99c775a606e2d8862179139ffda61dc861c019e55cd2876eb2a27d84b"
          ],
          [
            "a0b1cae06b0a847a3fea6e671aaf8adfdfe58ca2f768105c8082b2e449fce252",
            "ae434102edde0958ec4b19d917a6a28e6b72da1834aff0e650f049503a296cf2"
          ],
          [
            "4e8ceafb9b3e9a136dc7ff67e840295b499dfb3b2133e4ba113f2e4c0e121e5",
            "cf2174118c8b6d7a4b48f6d534ce5c79422c086a63460502b827ce62a326683c"
          ],
          [
            "d24a44e047e19b6f5afb81c7ca2f69080a5076689a010919f42725c2b789a33b",
            "6fb8d5591b466f8fc63db50f1c0f1c69013f996887b8244d2cdec417afea8fa3"
          ],
          [
            "ea01606a7a6c9cdd249fdfcfacb99584001edd28abbab77b5104e98e8e3b35d4",
            "322af4908c7312b0cfbfe369f7a7b3cdb7d4494bc2823700cfd652188a3ea98d"
          ],
          [
            "af8addbf2b661c8a6c6328655eb96651252007d8c5ea31be4ad196de8ce2131f",
            "6749e67c029b85f52a034eafd096836b2520818680e26ac8f3dfbcdb71749700"
          ],
          [
            "e3ae1974566ca06cc516d47e0fb165a674a3dabcfca15e722f0e3450f45889",
            "2aeabe7e4531510116217f07bf4d07300de97e4874f81f533420a72eeb0bd6a4"
          ],
          [
            "591ee355313d99721cf6993ffed1e3e301993ff3ed258802075ea8ced397e246",
            "b0ea558a113c30bea60fc4775460c7901ff0b053d25ca2bdeee98f1a4be5d196"
          ],
          [
            "11396d55fda54c49f19aa97318d8da61fa8584e47b084945077cf03255b52984",
            "998c74a8cd45ac01289d5833a7beb4744ff536b01b257be4c5767bea93ea57a4"
          ],
          [
            "3c5d2a1ba39c5a1790000738c9e0c40b8dcdfd5468754b6405540157e017aa7a",
            "b2284279995a34e2f9d4de7396fc18b80f9b8b9fdd270f6661f79ca4c81bd257"
          ],
          [
            "cc8704b8a60a0defa3a99a7299f2e9c3fbc395afb04ac078425ef8a1793cc030",
            "bdd46039feed17881d1e0862db347f8cf395b74fc4bcdc4e940b74e3ac1f1b13"
          ],
          [
            "c533e4f7ea8555aacd9777ac5cad29b97dd4defccc53ee7ea204119b2889b197",
            "6f0a256bc5efdf429a2fb6242f1a43a2d9b925bb4a4b3a26bb8e0f45eb596096"
          ],
          [
            "c14f8f2ccb27d6f109f6d08d03cc96a69ba8c34eec07bbcf566d48e33da6593",
            "c359d6923bb398f7fd4473e16fe1c28475b740dd098075e6c0e8649113dc3a38"
          ],
          [
            "a6cbc3046bc6a450bac24789fa17115a4c9739ed75f8f21ce441f72e0b90e6ef",
            "21ae7f4680e889bb130619e2c0f95a360ceb573c70603139862afd617fa9b9f"
          ],
          [
            "347d6d9a02c48927ebfb86c1359b1caf130a3c0267d11ce6344b39f99d43cc38",
            "60ea7f61a353524d1c987f6ecec92f086d565ab687870cb12689ff1e31c74448"
          ],
          [
            "da6545d2181db8d983f7dcb375ef5866d47c67b1bf31c8cf855ef7437b72656a",
            "49b96715ab6878a79e78f07ce5680c5d6673051b4935bd897fea824b77dc208a"
          ],
          [
            "c40747cc9d012cb1a13b8148309c6de7ec25d6945d657146b9d5994b8feb1111",
            "5ca560753be2a12fc6de6caf2cb489565db936156b9514e1bb5e83037e0fa2d4"
          ],
          [
            "4e42c8ec82c99798ccf3a610be870e78338c7f713348bd34c8203ef4037f3502",
            "7571d74ee5e0fb92a7a8b33a07783341a5492144cc54bcc40a94473693606437"
          ],
          [
            "3775ab7089bc6af823aba2e1af70b236d251cadb0c86743287522a1b3b0dedea",
            "be52d107bcfa09d8bcb9736a828cfa7fac8db17bf7a76a2c42ad961409018cf7"
          ],
          [
            "cee31cbf7e34ec379d94fb814d3d775ad954595d1314ba8846959e3e82f74e26",
            "8fd64a14c06b589c26b947ae2bcf6bfa0149ef0be14ed4d80f448a01c43b1c6d"
          ],
          [
            "b4f9eaea09b6917619f6ea6a4eb5464efddb58fd45b1ebefcdc1a01d08b47986",
            "39e5c9925b5a54b07433a4f18c61726f8bb131c012ca542eb24a8ac07200682a"
          ],
          [
            "d4263dfc3d2df923a0179a48966d30ce84e2515afc3dccc1b77907792ebcc60e",
            "62dfaf07a0f78feb30e30d6295853ce189e127760ad6cf7fae164e122a208d54"
          ],
          [
            "48457524820fa65a4f8d35eb6930857c0032acc0a4a2de422233eeda897612c4",
            "25a748ab367979d98733c38a1fa1c2e7dc6cc07db2d60a9ae7a76aaa49bd0f77"
          ],
          [
            "dfeeef1881101f2cb11644f3a2afdfc2045e19919152923f367a1767c11cceda",
            "ecfb7056cf1de042f9420bab396793c0c390bde74b4bbdff16a83ae09a9a7517"
          ],
          [
            "6d7ef6b17543f8373c573f44e1f389835d89bcbc6062ced36c82df83b8fae859",
            "cd450ec335438986dfefa10c57fea9bcc521a0959b2d80bbf74b190dca712d10"
          ],
          [
            "e75605d59102a5a2684500d3b991f2e3f3c88b93225547035af25af66e04541f",
            "f5c54754a8f71ee540b9b48728473e314f729ac5308b06938360990e2bfad125"
          ],
          [
            "eb98660f4c4dfaa06a2be453d5020bc99a0c2e60abe388457dd43fefb1ed620c",
            "6cb9a8876d9cb8520609af3add26cd20a0a7cd8a9411131ce85f44100099223e"
          ],
          [
            "13e87b027d8514d35939f2e6892b19922154596941888336dc3563e3b8dba942",
            "fef5a3c68059a6dec5d624114bf1e91aac2b9da568d6abeb2570d55646b8adf1"
          ],
          [
            "ee163026e9fd6fe017c38f06a5be6fc125424b371ce2708e7bf4491691e5764a",
            "1acb250f255dd61c43d94ccc670d0f58f49ae3fa15b96623e5430da0ad6c62b2"
          ],
          [
            "b268f5ef9ad51e4d78de3a750c2dc89b1e626d43505867999932e5db33af3d80",
            "5f310d4b3c99b9ebb19f77d41c1dee018cf0d34fd4191614003e945a1216e423"
          ],
          [
            "ff07f3118a9df035e9fad85eb6c7bfe42b02f01ca99ceea3bf7ffdba93c4750d",
            "438136d603e858a3a5c440c38eccbaddc1d2942114e2eddd4740d098ced1f0d8"
          ],
          [
            "8d8b9855c7c052a34146fd20ffb658bea4b9f69e0d825ebec16e8c3ce2b526a1",
            "cdb559eedc2d79f926baf44fb84ea4d44bcf50fee51d7ceb30e2e7f463036758"
          ],
          [
            "52db0b5384dfbf05bfa9d472d7ae26dfe4b851ceca91b1eba54263180da32b63",
            "c3b997d050ee5d423ebaf66a6db9f57b3180c902875679de924b69d84a7b375"
          ],
          [
            "e62f9490d3d51da6395efd24e80919cc7d0f29c3f3fa48c6fff543becbd43352",
            "6d89ad7ba4876b0b22c2ca280c682862f342c8591f1daf5170e07bfd9ccafa7d"
          ],
          [
            "7f30ea2476b399b4957509c88f77d0191afa2ff5cb7b14fd6d8e7d65aaab1193",
            "ca5ef7d4b231c94c3b15389a5f6311e9daff7bb67b103e9880ef4bff637acaec"
          ],
          [
            "5098ff1e1d9f14fb46a210fada6c903fef0fb7b4a1dd1d9ac60a0361800b7a00",
            "9731141d81fc8f8084d37c6e7542006b3ee1b40d60dfe5362a5b132fd17ddc0"
          ],
          [
            "32b78c7de9ee512a72895be6b9cbefa6e2f3c4ccce445c96b9f2c81e2778ad58",
            "ee1849f513df71e32efc3896ee28260c73bb80547ae2275ba497237794c8753c"
          ],
          [
            "e2cb74fddc8e9fbcd076eef2a7c72b0ce37d50f08269dfc074b581550547a4f7",
            "d3aa2ed71c9dd2247a62df062736eb0baddea9e36122d2be8641abcb005cc4a4"
          ],
          [
            "8438447566d4d7bedadc299496ab357426009a35f235cb141be0d99cd10ae3a8",
            "c4e1020916980a4da5d01ac5e6ad330734ef0d7906631c4f2390426b2edd791f"
          ],
          [
            "4162d488b89402039b584c6fc6c308870587d9c46f660b878ab65c82c711d67e",
            "67163e903236289f776f22c25fb8a3afc1732f2b84b4e95dbda47ae5a0852649"
          ],
          [
            "3fad3fa84caf0f34f0f89bfd2dcf54fc175d767aec3e50684f3ba4a4bf5f683d",
            "cd1bc7cb6cc407bb2f0ca647c718a730cf71872e7d0d2a53fa20efcdfe61826"
          ],
          [
            "674f2600a3007a00568c1a7ce05d0816c1fb84bf1370798f1c69532faeb1a86b",
            "299d21f9413f33b3edf43b257004580b70db57da0b182259e09eecc69e0d38a5"
          ],
          [
            "d32f4da54ade74abb81b815ad1fb3b263d82d6c692714bcff87d29bd5ee9f08f",
            "f9429e738b8e53b968e99016c059707782e14f4535359d582fc416910b3eea87"
          ],
          [
            "30e4e670435385556e593657135845d36fbb6931f72b08cb1ed954f1e3ce3ff6",
            "462f9bce619898638499350113bbc9b10a878d35da70740dc695a559eb88db7b"
          ],
          [
            "be2062003c51cc3004682904330e4dee7f3dcd10b01e580bf1971b04d4cad297",
            "62188bc49d61e5428573d48a74e1c655b1c61090905682a0d5558ed72dccb9bc"
          ],
          [
            "93144423ace3451ed29e0fb9ac2af211cb6e84a601df5993c419859fff5df04a",
            "7c10dfb164c3425f5c71a3f9d7992038f1065224f72bb9d1d902a6d13037b47c"
          ],
          [
            "b015f8044f5fcbdcf21ca26d6c34fb8197829205c7b7d2a7cb66418c157b112c",
            "ab8c1e086d04e813744a655b2df8d5f83b3cdc6faa3088c1d3aea1454e3a1d5f"
          ],
          [
            "d5e9e1da649d97d89e4868117a465a3a4f8a18de57a140d36b3f2af341a21b52",
            "4cb04437f391ed73111a13cc1d4dd0db1693465c2240480d8955e8592f27447a"
          ],
          [
            "d3ae41047dd7ca065dbf8ed77b992439983005cd72e16d6f996a5316d36966bb",
            "bd1aeb21ad22ebb22a10f0303417c6d964f8cdd7df0aca614b10dc14d125ac46"
          ],
          [
            "463e2763d885f958fc66cdd22800f0a487197d0a82e377b49f80af87c897b065",
            "bfefacdb0e5d0fd7df3a311a94de062b26b80c61fbc97508b79992671ef7ca7f"
          ],
          [
            "7985fdfd127c0567c6f53ec1bb63ec3158e597c40bfe747c83cddfc910641917",
            "603c12daf3d9862ef2b25fe1de289aed24ed291e0ec6708703a5bd567f32ed03"
          ],
          [
            "74a1ad6b5f76e39db2dd249410eac7f99e74c59cb83d2d0ed5ff1543da7703e9",
            "cc6157ef18c9c63cd6193d83631bbea0093e0968942e8c33d5737fd790e0db08"
          ],
          [
            "30682a50703375f602d416664ba19b7fc9bab42c72747463a71d0896b22f6da3",
            "553e04f6b018b4fa6c8f39e7f311d3176290d0e0f19ca73f17714d9977a22ff8"
          ],
          [
            "9e2158f0d7c0d5f26c3791efefa79597654e7a2b2464f52b1ee6c1347769ef57",
            "712fcdd1b9053f09003a3481fa7762e9ffd7c8ef35a38509e2fbf2629008373"
          ],
          [
            "176e26989a43c9cfeba4029c202538c28172e566e3c4fce7322857f3be327d66",
            "ed8cc9d04b29eb877d270b4878dc43c19aefd31f4eee09ee7b47834c1fa4b1c3"
          ],
          [
            "75d46efea3771e6e68abb89a13ad747ecf1892393dfc4f1b7004788c50374da8",
            "9852390a99507679fd0b86fd2b39a868d7efc22151346e1a3ca4726586a6bed8"
          ],
          [
            "809a20c67d64900ffb698c4c825f6d5f2310fb0451c869345b7319f645605721",
            "9e994980d9917e22b76b061927fa04143d096ccc54963e6a5ebfa5f3f8e286c1"
          ],
          [
            "1b38903a43f7f114ed4500b4eac7083fdefece1cf29c63528d563446f972c180",
            "4036edc931a60ae889353f77fd53de4a2708b26b6f5da72ad3394119daf408f9"
          ]
        ]
      }
    };
    const conf = {
      prime: "k256",
      p: "ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f",
      a: "0",
      b: "7",
      n: "ffffffff ffffffff ffffffff fffffffe baaedce6 af48a03b bfd25e8c d0364141",
      h: "1",
      // Precomputed endomorphism
      beta: "7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee",
      lambda: "5363ad4cc05c30e0a5261c028812645a122e22ea20816678df02967c1b23bd72",
      basis: [
        {
          a: "3086d221a7d46bcde86c90e49284eb15",
          b: "-e4437ed6010e88286f547fa90abfe4c3"
        },
        {
          a: "114ca50f7a8e2f3f657c1108d9d44cfd8",
          b: "3086d221a7d46bcde86c90e49284eb15"
        }
      ],
      gRed: false,
      g: [
        "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
        "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8",
        precomputed
      ]
    };
    this.p = new BigNumber(conf.p, 16);
    this.red = new ReductionContext(conf.prime);
    this.zero = new BigNumber(0).toRed(this.red);
    this.one = new BigNumber(1).toRed(this.red);
    this.two = new BigNumber(2).toRed(this.red);
    this.n = new BigNumber(conf.n, 16);
    this.g = Point.fromJSON(conf.g, conf.gRed);
    this._wnafT1 = new Array(4);
    this._wnafT2 = new Array(4);
    this._wnafT3 = new Array(4);
    this._wnafT4 = new Array(4);
    this._bitLength = this.n.bitLength();
    this.redN = this.n.toRed(this.red);
    this.a = new BigNumber(conf.a, 16).toRed(this.red);
    this.b = new BigNumber(conf.b, 16).toRed(this.red);
    this.tinv = this.two.redInvm();
    this.zeroA = this.a.fromRed().cmpn(0) === 0;
    this.threeA = this.a.fromRed().sub(this.p).cmpn(-3) === 0;
    this.endo = this._getEndomorphism(conf);
    this._endoWnafT1 = new Array(4);
    this._endoWnafT2 = new Array(4);
  }
  _getEndomorphism(conf) {
    if (!this.zeroA || this.p.modrn(3) !== 1) {
      return;
    }
    let beta;
    let lambda;
    if (conf.beta === void 0) {
      const betas = this._getEndoRoots(this.p);
      if (betas === null) {
        throw new Error("Failed to get endomorphism roots for beta.");
      }
      beta = betas[0].cmp(betas[1]) < 0 ? betas[0] : betas[1];
      beta = beta.toRed(this.red);
    } else {
      beta = new BigNumber(conf.beta, 16).toRed(this.red);
    }
    if (conf.lambda === void 0) {
      const lambdas = this._getEndoRoots(this.n);
      if (lambdas === null) {
        throw new Error("Failed to get endomorphism roots for lambda.");
      }
      if (this.g == null) {
        throw new Error("Curve generator point (g) is not defined.");
      }
      const gMulX = this.g.mul(lambdas[0])?.x;
      const gXRedMulBeta = this.g.x == null ? void 0 : this.g.x.redMul(beta);
      if (gMulX != null && gXRedMulBeta != null && gMulX.cmp(gXRedMulBeta) === 0) {
        lambda = lambdas[0];
      } else {
        lambda = lambdas[1];
        if (this.g == null) {
          throw new Error("Curve generator point (g) is not defined.");
        }
        const gMulX2 = this.g.mul(lambda)?.x;
        const gXRedMulBeta2 = this.g.x == null ? void 0 : this.g.x.redMul(beta);
        if (gMulX2 == null || gXRedMulBeta2 == null) {
          throw new Error("Lambda computation failed: g.mul(lambda).x or g.x.redMul(beta) is undefined.");
        }
        _Curve.assert(gMulX2.cmp(gXRedMulBeta2) === 0, "Lambda selection does not match computed beta.");
      }
    } else {
      lambda = new BigNumber(conf.lambda, 16);
    }
    let basis;
    if (typeof conf.basis === "object" && conf.basis !== null) {
      basis = conf.basis.map(function(vec) {
        return {
          a: new BigNumber(vec.a, 16),
          b: new BigNumber(vec.b, 16)
        };
      });
    } else {
      basis = this._getEndoBasis(lambda);
    }
    return {
      beta,
      lambda,
      basis
    };
  }
  _getEndoRoots(num) {
    const red2 = num === this.p ? this.red : new MontgomoryMethod(num);
    const tinv = new BigNumber(2).toRed(red2).redInvm();
    const ntinv = tinv.redNeg();
    const s4 = new BigNumber(3).toRed(red2).redNeg().redSqrt().redMul(tinv);
    const l1 = ntinv.redAdd(s4).fromRed();
    const l22 = ntinv.redSub(s4).fromRed();
    return [l1, l22];
  }
  _getEndoBasis(lambda) {
    const aprxSqrt = this.n.ushrn(Math.floor(this.n.bitLength() / 2));
    let u3 = lambda;
    let v3 = this.n.clone();
    let x1 = new BigNumber(1);
    let y1 = new BigNumber(0);
    let x22 = new BigNumber(0);
    let y22 = new BigNumber(1);
    let a0;
    let b0;
    let a1;
    let b1;
    let a22;
    let b22;
    let prevR = new BigNumber(0);
    let i = 0;
    let r3 = new BigNumber(0);
    let x5 = new BigNumber(0);
    while (u3.cmpn(0) !== 0) {
      const q3 = v3.div(u3);
      r3 = v3.sub(q3.mul(u3));
      x5 = x22.sub(q3.mul(x1));
      const y7 = y22.sub(q3.mul(y1));
      if (a1 === void 0 && r3.cmp(aprxSqrt) < 0) {
        a0 = prevR.neg();
        b0 = x1;
        a1 = r3.neg();
        b1 = x5;
      } else if (a1 !== void 0 && ++i === 2) {
        break;
      }
      prevR = r3;
      v3 = u3;
      u3 = r3;
      x22 = x1;
      x1 = x5;
      y22 = y1;
      y1 = y7;
    }
    if (a0 === void 0 || b0 === void 0 || a1 === void 0 || b1 === void 0) {
      throw new Error("Failed to compute Endo Basis values");
    }
    a22 = r3.neg();
    b22 = x5;
    const len1 = a1.sqr().add(b1.sqr());
    const len2 = a22.sqr().add(b22.sqr());
    if (len2.cmp(len1) >= 0) {
      a22 = a0;
      b22 = b0;
    }
    if (a1.negative !== 0) {
      a1 = a1.neg();
      b1 = b1.neg();
    }
    if (a22.negative !== 0) {
      a22 = a22.neg();
      b22 = b22.neg();
    }
    return [
      { a: a1, b: b1 },
      { a: a22, b: b22 }
    ];
  }
  _endoSplit(k4) {
    if (this.endo == null) {
      throw new Error("Endomorphism is not defined.");
    }
    const basis = this.endo.basis;
    const v1 = basis[0];
    const v22 = basis[1];
    const c1 = v22.b.mul(k4).divRound(this.n);
    const c22 = v1.b.neg().mul(k4).divRound(this.n);
    const p1 = c1.mul(v1.a);
    const p22 = c22.mul(v22.a);
    const q1 = c1.mul(v1.b);
    const q22 = c22.mul(v22.b);
    const k1 = k4.sub(p1).sub(p22);
    const k22 = q1.add(q22).neg();
    return { k1, k2: k22 };
  }
  validate(point) {
    if (point.inf) {
      return true;
    }
    const x5 = point.x;
    const y7 = point.y;
    if (x5 === null || y7 === null) {
      throw new Error("Point coordinates cannot be null");
    }
    const ax = this.a.redMul(x5);
    const rhs = x5.redSqr().redMul(x5).redIAdd(ax).redIAdd(this.b);
    return y7.redSqr().redISub(rhs).cmpn(0) === 0;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/Signature.js
var Signature = class _Signature {
  /**
   * @property Represents the "r" component of the digital signature
   */
  r;
  /**
   * @property Represents the "s" component of the digital signature
   */
  s;
  /**
   * Takes an array of numbers or a string and returns a new Signature instance.
   * This method will throw an error if the DER encoding is invalid.
   * If a string is provided, it is assumed to represent a hexadecimal sequence.
   *
   * @static
   * @method fromDER
   * @param data - The sequence to decode from DER encoding.
   * @param enc - The encoding of the data string.
   * @returns The decoded data in the form of Signature instance.
   *
   * @example
   * const signature = Signature.fromDER('30440220018c1f5502f8...', 'hex');
   */
  static fromDER(data, enc) {
    const getLength = (buf, p6) => {
      const initial = buf[p6.place++];
      if ((initial & 128) === 0) {
        return initial;
      } else {
        throw new Error("Invalid DER entity length");
      }
    };
    class Position {
      place;
      constructor() {
        this.place = 0;
      }
    }
    data = toArray2(data, enc);
    const p5 = new Position();
    if (data[p5.place++] !== 48) {
      throw new Error("Signature DER must start with 0x30");
    }
    const len = getLength(data, p5);
    if (len + p5.place !== data.length) {
      throw new Error("Signature DER invalid");
    }
    if (data[p5.place++] !== 2) {
      throw new Error("Signature DER invalid");
    }
    const rlen = getLength(data, p5);
    let r3 = data.slice(p5.place, rlen + p5.place);
    p5.place += rlen;
    if (data[p5.place++] !== 2) {
      throw new Error("Signature DER invalid");
    }
    const slen = getLength(data, p5);
    if (data.length !== slen + p5.place) {
      throw new Error("Invalid R-length in signature DER");
    }
    let s4 = data.slice(p5.place, slen + p5.place);
    if (r3[0] === 0) {
      if ((r3[1] & 128) === 0) {
        throw new Error("Invalid R-value in signature DER");
      } else {
        r3 = r3.slice(1);
      }
    }
    if (s4[0] === 0) {
      if ((s4[1] & 128) === 0) {
        throw new Error("Invalid S-value in signature DER");
      } else {
        s4 = s4.slice(1);
      }
    }
    return new _Signature(new BigNumber(r3), new BigNumber(s4));
  }
  /**
   * Takes an array of numbers or a string and returns a new Signature instance.
   * This method will throw an error if the Compact encoding is invalid.
   * If a string is provided, it is assumed to represent a hexadecimal sequence.
   * compactByte value 27-30 means uncompressed public key.
   * 31-34 means compressed public key.
   * The range represents the recovery param which can be 0,1,2,3.
   * We could support recovery functions in future if there's demand.
   *
   * @static
   * @method fromCompact
   * @param data - The sequence to decode from Compact encoding.
   * @param enc - The encoding of the data string.
   * @returns The decoded data in the form of Signature instance.
   *
   * @example
   * const signature = Signature.fromCompact('1b18c1f5502f8...', 'hex');
   */
  static fromCompact(data, enc) {
    data = toArray2(data, enc);
    if (data.length !== 65) {
      throw new Error("Invalid Compact Signature");
    }
    const compactByte = data[0];
    if (compactByte < 27 || compactByte >= 35) {
      throw new Error("Invalid Compact Byte");
    }
    return new _Signature(new BigNumber(data.slice(1, 33)), new BigNumber(data.slice(33, 65)));
  }
  /**
   * Creates an instance of the Signature class.
   *
   * @constructor
   * @param r - The R component of the signature.
   * @param s - The S component of the signature.
   *
   * @example
   * const r = new BigNumber('208755674028...');
   * const s = new BigNumber('564745627577...');
   * const signature = new Signature(r, s);
   */
  constructor(r3, s4) {
    this.r = r3;
    this.s = s4;
  }
  /**
   * Verifies a digital signature.
   *
   * This method will return true if the signature, key, and message hash match.
   * If the data or key do not match the signature, the function returns false.
   *
   * @method verify
   * @param msg - The message to verify.
   * @param key - The public key used to sign the original message.
   * @param enc - The encoding of the msg string.
   * @returns A boolean representing whether the signature is valid.
   *
   * @example
   * const msg = 'The quick brown fox jumps over the lazy dog';
   * const publicKey = PublicKey.fromString('04188ca1050...');
   * const isVerified = signature.verify(msg, publicKey);
   */
  verify(msg, key, enc) {
    const msgHash = new BigNumber(sha256(msg, enc), 16);
    return verify(msgHash, this, key);
  }
  /**
   * Converts an instance of Signature into DER encoding.
   * An alias for the toDER method.
   *
   * If the encoding parameter is set to 'hex', the function will return a hex string.
   * If 'base64', it will return a base64 string.
   * Otherwise, it will return an array of numbers.
   *
   * @method toDER
   * @param enc - The encoding to use for the output.
   * @returns The current instance in DER encoding.
   *
   * @example
   * const der = signature.toString('base64');
   */
  toString(enc) {
    return this.toDER(enc);
  }
  /**
   * Converts an instance of Signature into DER encoding.
   *
   * If the encoding parameter is set to 'hex', the function will return a hex string.
   * If 'base64', it will return a base64 string.
   * Otherwise, it will return an array of numbers.
   *
   * @method toDER
   * @param enc - The encoding to use for the output.
   * @returns The current instance in DER encoding.
   *
   * @example
   * const der = signature.toDER('hex');
   */
  toDER(enc) {
    const constructLength = (arr2, len) => {
      if (len < 128) {
        arr2.push(len);
      } else {
        throw new Error("len must be < 0x80");
      }
    };
    const rmPadding = (buf) => {
      let i = 0;
      const len = buf.length - 1;
      while (buf[i] === 0 && (buf[i + 1] & 128) === 0 && i < len) {
        i++;
      }
      if (i === 0) {
        return buf;
      }
      return buf.slice(i);
    };
    let r3 = this.r.toArray();
    let s4 = this.s.toArray();
    if ((r3[0] & 128) !== 0) {
      r3 = [0].concat(r3);
    }
    if ((s4[0] & 128) !== 0) {
      s4 = [0].concat(s4);
    }
    r3 = rmPadding(r3);
    s4 = rmPadding(s4);
    while (s4[0] === 0 && (s4[1] & 128) === 0) {
      s4 = s4.slice(1);
    }
    let arr = [2];
    constructLength(arr, r3.length);
    arr = arr.concat(r3);
    arr.push(2);
    constructLength(arr, s4.length);
    const backHalf = arr.concat(s4);
    let res = [48];
    constructLength(res, backHalf.length);
    res = res.concat(backHalf);
    if (enc === "hex") {
      return toHex(res);
    } else if (enc === "base64") {
      return toBase64(res);
    } else {
      return res;
    }
  }
  /**
   * Converts an instance of Signature into Compact encoding.
   *
   * If the encoding parameter is set to 'hex', the function will return a hex string.
   * If 'base64', it will return a base64 string.
   * Otherwise, it will return an array of numbers.
   *
   * @method toCompact
   * @param enc - The encoding to use for the output.
   * @returns The current instance in DER encoding.
   *
   * @example
   * const compact = signature.toCompact(3, true, 'base64');
   */
  toCompact(recovery, compressed, enc) {
    if (recovery < 0 || recovery > 3)
      throw new Error("Invalid recovery param");
    if (typeof compressed !== "boolean") {
      throw new TypeError("Invalid compressed param");
    }
    let compactByte = 27 + recovery;
    if (compressed) {
      compactByte += 4;
    }
    let arr = [compactByte];
    arr = arr.concat(this.r.toArray("be", 32));
    arr = arr.concat(this.s.toArray("be", 32));
    if (enc === "hex") {
      return toHex(arr);
    } else if (enc === "base64") {
      return toBase64(arr);
    } else {
      return arr;
    }
  }
  /**
   * Recovers the public key from a signature.
   * This method will return the public key if it finds a valid public key.
   * If it does not find a valid public key, it will throw an error.
   * The recovery factor is a number between 0 and 3.
   * @method RecoverPublicKey
   * @param recovery - The recovery factor.
   * @param e - The message hash.
   * @returns The public key associated with the signature.
   *
   * @example
   * const publicKey = signature.RecoverPublicKey(0, msgHash);
   */
  RecoverPublicKey(recovery, e2) {
    const r3 = this.r;
    const s4 = this.s;
    const isYOdd = (recovery & 1) !== 0;
    const isSecondKey = recovery >> 1;
    const curve2 = new Curve();
    const n2 = curve2.n;
    const G = curve2.g;
    const x5 = isSecondKey === 0 ? r3 : r3.add(n2);
    const R6 = Point.fromX(x5, isYOdd);
    const nR = R6.mul(n2);
    if (!nR.isInfinity()) {
      throw new Error("nR is not at infinity");
    }
    const eNeg = e2.neg().umod(n2);
    const rInv = r3.invm(n2);
    const srInv = rInv.mul(s4).umod(n2);
    const eInvrInv = rInv.mul(eNeg).umod(n2);
    const Q2 = G.mul(eInvrInv).add(R6.mul(srInv));
    const pubKey = new PublicKey(Q2);
    pubKey.validate();
    return pubKey;
  }
  /**
   * Calculates the recovery factor which will work for a particular public key and message hash.
   * This method will return the recovery factor if it finds a valid recovery factor.
   * If it does not find a valid recovery factor, it will throw an error.
   * The recovery factor is a number between 0 and 3.
   *
   * @method CalculateRecoveryFactor
   * @param msgHash - The message hash.
   * @returns the recovery factor: number
   * /
   * @example
   * const recovery = signature.CalculateRecoveryFactor(publicKey, msgHash);
   */
  CalculateRecoveryFactor(pubkey, msgHash) {
    for (let recovery = 0; recovery < 4; recovery++) {
      let Qprime;
      try {
        Qprime = this.RecoverPublicKey(recovery, msgHash);
      } catch {
        continue;
      }
      if (pubkey.eq(Qprime)) {
        return recovery;
      }
    }
    throw new Error("Unable to find valid recovery factor");
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/DRBG.js
var DRBG = class {
  K;
  V;
  constructor(entropy, nonce) {
    const entropyBytes = toArray2(entropy, "hex");
    const nonceBytes = toArray2(nonce, "hex");
    if (entropyBytes.length !== 32) {
      throw new Error("Entropy must be exactly 32 bytes (256 bits)");
    }
    if (nonceBytes.length !== 32) {
      throw new Error("Nonce must be exactly 32 bytes (256 bits)");
    }
    const seedMaterial = entropyBytes.concat(nonceBytes);
    this.K = new Array(32);
    this.V = new Array(32);
    for (let i = 0; i < 32; i++) {
      this.K[i] = 0;
      this.V[i] = 1;
    }
    this.update(seedMaterial);
  }
  /**
   * Generates HMAC using the K value of the instance. This method is used internally for operations.
   *
   * @method hmac
   * @returns The SHA256HMAC object created with K value.
   *
   * @example
   * const hmac = drbg.hmac();
   */
  hmac() {
    return new SHA256HMAC(this.K);
  }
  /**
   * Updates the `K` and `V` values of the instance based on the seed.
   * The seed if not provided uses `V` as seed.
   *
   * @method update
   * @param seed - an optional value that used to update `K` and `V`. Default is `undefined`.
   * @returns Nothing, but updates the internal state `K` and `V` value.
   *
   * @example
   * drbg.update('e13af...');
   */
  update(seed) {
    let kmac = this.hmac().update(this.V).update([0]);
    if (seed !== void 0) {
      kmac = kmac.update(seed);
    }
    this.K = kmac.digest();
    this.V = this.hmac().update(this.V).digest();
    if (seed === void 0) {
      return;
    }
    this.K = this.hmac().update(this.V).update([1]).update(seed).digest();
    this.V = this.hmac().update(this.V).digest();
  }
  /**
   * Generates deterministic random hexadecimal string of given length.
   * In every generation process, it also updates the internal state `K` and `V`.
   *
   * @method generate
   * @param len - The length of required random number.
   * @returns The required deterministic random hexadecimal string.
   *
   * @example
   * const randomHex = drbg.generate(256);
   */
  generate(len) {
    let temp = [];
    while (temp.length < len) {
      this.V = this.hmac().update(this.V).digest();
      temp = temp.concat(this.V);
    }
    const res = temp.slice(0, len);
    this.update();
    return toHex(res);
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/ECDSA.js
function truncateToN(msg, truncOnly, curve2 = new Curve()) {
  const delta = msg.byteLength() * 8 - curve2.n.bitLength();
  if (delta > 0) {
    msg.iushrn(delta);
  }
  if (truncOnly !== true && msg.cmp(curve2.n) >= 0) {
    return msg.sub(curve2.n);
  } else {
    return msg;
  }
}
function bnToBigInt(bn) {
  const bytes2 = bn.toArray("be");
  let x5 = 0n;
  for (const byte of bytes2) {
    x5 = x5 << 8n | BigInt(byte);
  }
  return x5;
}
var curve = new Curve();
var bytes = curve.n.byteLength();
var ns1 = curve.n.subn(1);
var halfN = N_BIGINT >> 1n;
var sign = (msg, key, forceLowS = false, customK) => {
  const nBitLength = curve.n.bitLength();
  if (msg.bitLength() > nBitLength) {
    throw new Error(`ECDSA message is too large: expected <= ${nBitLength} bits. Callers must hash messages before signing.`);
  }
  msg = truncateToN(msg);
  const msgBig = bnToBigInt(msg);
  const keyBig = bnToBigInt(key);
  const bkey = key.toArray("be", bytes);
  const nonce = msg.toArray("be", bytes);
  const drbg = new DRBG(bkey, nonce);
  for (let iter = 0; ; iter++) {
    let kBN;
    if (typeof customK === "function") {
      kBN = customK(iter);
    } else if (BigNumber.isBN(customK)) {
      kBN = customK;
    } else {
      kBN = new BigNumber(drbg.generate(bytes), 16);
    }
    if (kBN == null) {
      throw new Error("k is undefined");
    }
    kBN = truncateToN(kBN, true);
    if (kBN.cmpn(1) < 0 || kBN.cmp(ns1) > 0) {
      if (BigNumber.isBN(customK)) {
        throw new Error("Invalid fixed custom K value (must be >1 and <N-1)");
      }
      continue;
    }
    const R6 = curve.g.mulCT(kBN);
    if (R6.isInfinity()) {
      if (BigNumber.isBN(customK)) {
        throw new Error("Invalid fixed custom K value (k\xB7G at infinity)");
      }
      continue;
    }
    const xAff = BigInt("0x" + R6.getX().toString(16));
    const rBig = modN(xAff);
    if (rBig === 0n) {
      if (BigNumber.isBN(customK)) {
        throw new Error("Invalid fixed custom K value (r == 0)");
      }
      continue;
    }
    const kBig = BigInt("0x" + kBN.toString(16));
    const kInv = modInvN(kBig);
    const rTimesKey = modMulN(rBig, keyBig);
    const sum = modN(msgBig + rTimesKey);
    let sBig = modMulN(kInv, sum);
    if (sBig === 0n) {
      if (BigNumber.isBN(customK)) {
        throw new Error("Invalid fixed custom K value (s == 0)");
      }
      continue;
    }
    if (forceLowS && sBig > halfN) {
      sBig = N_BIGINT - sBig;
    }
    const r3 = new BigNumber(rBig.toString(16), 16);
    const s4 = new BigNumber(sBig.toString(16), 16);
    return new Signature(r3, s4);
  }
};
var verify = (msg, sig, key) => {
  const nBitLength = curve.n.bitLength();
  if (msg.bitLength() > nBitLength) {
    return false;
  }
  const hash = bnToBigInt(msg);
  if (key.x == null || key.y == null) {
    throw new Error("Invalid public key: missing coordinates.");
  }
  const publicKey = {
    x: bnToBigInt(key.x),
    y: bnToBigInt(key.y)
  };
  const signature = {
    r: bnToBigInt(sig.r),
    s: bnToBigInt(sig.s)
  };
  const { r: r3, s: s4 } = signature;
  const z2 = hash;
  if (r3 <= BI_ZERO || r3 >= N_BIGINT || s4 <= BI_ZERO || s4 >= N_BIGINT) {
    return false;
  }
  const w3 = modInvN(s4);
  if (w3 === 0n)
    return false;
  const u1 = modMulN(z2, w3);
  const u22 = modMulN(r3, w3);
  const RG = scalarMultiplyWNAF(u1, { x: GX_BIGINT, y: GY_BIGINT });
  const RQ = scalarMultiplyWNAF(u22, publicKey);
  const R6 = jpAdd(RG, RQ);
  if (R6.Z === 0n)
    return false;
  const zInv = biModInv(R6.Z);
  const zInv2 = biModMul(zInv, zInv);
  const xAff = biModMul(R6.X, zInv2);
  const v3 = modN(xAff);
  return v3 === r3;
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/PublicKey.js
var PublicKey = class _PublicKey extends Point {
  /**
   * Static factory method to derive a public key from a private key.
   * It multiplies the generator point 'g' on the elliptic curve by the private key.
   *
   * @static
   * @method fromPrivateKey
   *
   * @param key - The private key from which to derive the public key.
   *
   * @returns Returns the PublicKey derived from the given PrivateKey.
   *
   * @example
   * const myPrivKey = new PrivateKey(...)
   * const myPubKey = PublicKey.fromPrivateKey(myPrivKey)
   */
  static fromPrivateKey(key) {
    const c4 = new Curve();
    const p5 = c4.g.mul(key);
    return new _PublicKey(p5.x, p5.y);
  }
  /**
   * Static factory method to create a PublicKey instance from a string.
   *
   * @param str - A string representing a public key.
   *
   * @returns Returns the PublicKey created from the string.
   *
   * @example
   * const myPubKey = PublicKey.fromString("03....")
   */
  static fromString(str) {
    const p5 = Point.fromString(str);
    return new _PublicKey(p5.x, p5.y);
  }
  /**
   * Static factory method to create a PublicKey instance from a number array.
   *
   * @param bytes - A number array representing a public key.
   *
   * @returns Returns the PublicKey created from the number array.
   *
   * @example
   * const myPubKey = PublicKey.fromString("03....")
   */
  static fromDER(bytes2) {
    const p5 = Point.fromDER(bytes2);
    return new _PublicKey(p5.x, p5.y);
  }
  /**
   * @constructor
   * @param x - A point or the x-coordinate of the point. May be a number, a BigNumber, a string (which will be interpreted as hex), a number array, or null. If null, an "Infinity" point is constructed.
   * @param y - If x is not a point, the y-coordinate of the point, similar to x.
   * @param isRed - A boolean indicating if the point is a member of the field of integers modulo the k256 prime. Default is true.
   *
   * @example
   * new PublicKey(point1);
   * new PublicKey('abc123', 'def456');
   */
  constructor(x5, y7 = null, isRed = true) {
    if (x5 instanceof Point) {
      super(x5.getX(), x5.getY());
    } else {
      if (y7 === null && isRed && typeof x5 === "string") {
        if (x5.length === 66 || x5.length === 130) {
          throw new Error('You are using the "new PublicKey()" constructor with a DER hex string. You need to use "PublicKey.fromString()" instead.');
        }
      }
      super(x5, y7, isRed);
    }
  }
  /**
   * Derive a shared secret from a public key and a private key for use in symmetric encryption.
   * This method multiplies the public key (an instance of Point) with a private key.
   *
   * @param priv - The private key to use in deriving the shared secret.
   *
   * @returns Returns the Point representing the shared secret.
   *
   * @throws Will throw an error if the public key is not valid for ECDH secret derivation.
   *
   * @example
   * const myPrivKey = new PrivateKey(...)
   * const sharedSecret = myPubKey.deriveSharedSecret(myPrivKey)
   */
  deriveSharedSecret(priv) {
    if (!this.validate()) {
      throw new Error("Public key not valid for ECDH secret derivation");
    }
    return this.mulCT(priv);
  }
  /**
   * Verify a signature of a message using this public key.
   *
   * @param msg - The message to verify. It can be a string or an array of numbers.
   * @param sig - The Signature of the message that needs verification.
   * @param enc - The encoding of the message. It defaults to 'utf8'.
   *
   * @returns Returns true if the signature is verified successfully, otherwise false.
   *
   * @example
   * const myMessage = "Hello, world!"
   * const mySignature = new Signature(...)
   * const isVerified = myPubKey.verify(myMessage, mySignature)
   */
  verify(msg, sig, enc) {
    const msgHash = new BigNumber(sha256(msg, enc), 16);
    return verify(msgHash, sig, this);
  }
  /**
   * Encode the public key to DER (Distinguished Encoding Rules) format.
   *
   * @returns Returns the DER-encoded public key in number array or string.
   *
   * @param enc - The encoding of the DER string. undefined = number array, 'hex' = hex string.
   *
   * @example
   * const derPublicKey = myPubKey.toDER()
   */
  toDER(enc) {
    if (enc === "hex")
      return this.encode(true, enc);
    return this.encode(true);
  }
  /**
   * Hash sha256 and ripemd160 of the public key.
   *
   * @returns Returns the hash of the public key.
   *
   * @example
   * const publicKeyHash = pubkey.toHash()
   */
  toHash(enc) {
    const pkh = hash160(this.encode(true));
    if (enc === "hex") {
      return toHex(pkh);
    }
    return pkh;
  }
  /**
   * Base58Check encodes the hash of the public key with a prefix to indicate locking script type.
   * Defaults to P2PKH for mainnet, otherwise known as a "Bitcoin Address".
   *
   * @param prefix defaults to [0x00] for mainnet, set to [0x6f] for testnet or use the strings 'mainnet' or 'testnet'
   *
   * @returns Returns the address encoding associated with the hash of the public key.
   *
   * @example
   * const address = pubkey.toAddress()
   * const address = pubkey.toAddress('mainnet')
   * const testnetAddress = pubkey.toAddress([0x6f])
   * const testnetAddress = pubkey.toAddress('testnet')
   */
  toAddress(prefix2 = [0]) {
    if (typeof prefix2 === "string") {
      if (prefix2 === "testnet" || prefix2 === "test") {
        prefix2 = [111];
      } else if (prefix2 === "mainnet" || prefix2 === "main") {
        prefix2 = [0];
      } else {
        throw new Error(`Invalid prefix ${prefix2}`);
      }
    }
    return toBase58Check(this.toHash(), prefix2);
  }
  /**
   * Derives a child key with BRC-42.
   * @param privateKey The private key of the other party
   * @param invoiceNumber The invoice number used to derive the child key
   * @param cacheSharedSecret Optional function to cache shared secrets
   * @param retrieveCachedSharedSecret Optional function to retrieve shared secrets from the cache
   * @returns The derived child key.
   */
  deriveChild(privateKey, invoiceNumber, cacheSharedSecret, retrieveCachedSharedSecret) {
    let sharedSecret;
    if (typeof retrieveCachedSharedSecret === "function") {
      const retrieved = retrieveCachedSharedSecret(privateKey, this);
      if (retrieved === void 0) {
        sharedSecret = this.deriveSharedSecret(privateKey);
        if (typeof cacheSharedSecret === "function") {
          cacheSharedSecret(privateKey, this, sharedSecret);
        }
      } else {
        sharedSecret = retrieved;
      }
    } else {
      sharedSecret = this.deriveSharedSecret(privateKey);
    }
    const invoiceNumberBin = toArray2(invoiceNumber, "utf8");
    const hmac2 = sha256hmac(sharedSecret.encode(true), invoiceNumberBin);
    const curve2 = new Curve();
    const point = curve2.g.mul(new BigNumber(hmac2));
    const finalPoint = this.add(point);
    return new _PublicKey(finalPoint.x, finalPoint.y);
  }
  /**
   * Takes an array of numbers or a string and returns a new PublicKey instance.
   * This method will throw an error if the Compact encoding is invalid.
   * If a string is provided, it is assumed to represent a hexadecimal sequence.
   * compactByte value 27-30 means uncompressed public key.
   * 31-34 means compressed public key.
   * The range represents the recovery param which can be 0,1,2,3.
   *
   * @static
   * @method fromMsgHashAndCompactSignature
   * @param msgHash - The message hash which was signed.
   * @param signature - The signature in compact format.
   * @param enc - The encoding of the signature string.
   * @returns A PublicKey instance derived from the message hash and compact signature.
   * @example
   * const publicKey = Signature.fromMsgHashAndCompactSignature(msgHash, 'IMOl2mVKfDgsSsHT4uIYBNN4e...', 'base64');
   */
  static fromMsgHashAndCompactSignature(msgHash, signature, enc) {
    const data = toArray2(signature, enc);
    if (data.length !== 65) {
      throw new Error("Invalid Compact Signature");
    }
    const compactByte = data[0];
    if (compactByte < 27 || compactByte >= 35) {
      throw new Error("Invalid Compact Byte");
    }
    let r3 = data[0] - 27;
    if (r3 > 3) {
      r3 -= 4;
    }
    const s4 = new Signature(new BigNumber(data.slice(1, 33)), new BigNumber(data.slice(33, 65)));
    return s4.RecoverPublicKey(r3, msgHash);
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/Random.js
var Rand = class {
  _rand;
  // ✅ Explicit function type
  getRandomValues(obj, n2) {
    const arr = new Uint8Array(n2);
    obj.crypto.getRandomValues(arr);
    return Array.from(arr);
  }
  constructor() {
    const noRand = () => {
      throw new Error("No secure random number generator is available in this environment.");
    };
    this._rand = noRand;
    if (typeof globalThis !== "undefined" && typeof globalThis.crypto?.getRandomValues === "function") {
      this._rand = (n2) => {
        return this.getRandomValues(globalThis, n2);
      };
      return;
    }
    if (typeof process !== "undefined" && process.release?.name === "node") {
      try {
        const crypto = __require("node:crypto");
        if (typeof crypto.randomBytes === "function") {
          this._rand = (n2) => {
            return Array.from(crypto.randomBytes(n2));
          };
          return;
        }
      } catch (_cryptoModuleUnavailable) {
      }
    }
    if (typeof globalThis.self !== "undefined" && typeof globalThis.self.crypto?.getRandomValues === "function") {
      this._rand = (n2) => {
        return this.getRandomValues(globalThis.self, n2);
      };
      return;
    }
    if (typeof globalThis.window !== "undefined" && typeof globalThis.window.crypto?.getRandomValues === "function") {
      this._rand = (n2) => {
        return this.getRandomValues(globalThis.window, n2);
      };
      return;
    }
    this._rand = noRand;
  }
  generate(len) {
    return this._rand(len);
  }
};
var ayn = null;
var Random = (len) => {
  ayn ??= new Rand();
  return ayn.generate(len);
};
var Random_default = Random;

// node_modules/@bsv/sdk/dist/esm/src/primitives/AESGCM.js
var SBox = new Uint8Array([
  99,
  124,
  119,
  123,
  242,
  107,
  111,
  197,
  48,
  1,
  103,
  43,
  254,
  215,
  171,
  118,
  202,
  130,
  201,
  125,
  250,
  89,
  71,
  240,
  173,
  212,
  162,
  175,
  156,
  164,
  114,
  192,
  183,
  253,
  147,
  38,
  54,
  63,
  247,
  204,
  52,
  165,
  229,
  241,
  113,
  216,
  49,
  21,
  4,
  199,
  35,
  195,
  24,
  150,
  5,
  154,
  7,
  18,
  128,
  226,
  235,
  39,
  178,
  117,
  9,
  131,
  44,
  26,
  27,
  110,
  90,
  160,
  82,
  59,
  214,
  179,
  41,
  227,
  47,
  132,
  83,
  209,
  0,
  237,
  32,
  252,
  177,
  91,
  106,
  203,
  190,
  57,
  74,
  76,
  88,
  207,
  208,
  239,
  170,
  251,
  67,
  77,
  51,
  133,
  69,
  249,
  2,
  127,
  80,
  60,
  159,
  168,
  81,
  163,
  64,
  143,
  146,
  157,
  56,
  245,
  188,
  182,
  218,
  33,
  16,
  255,
  243,
  210,
  205,
  12,
  19,
  236,
  95,
  151,
  68,
  23,
  196,
  167,
  126,
  61,
  100,
  93,
  25,
  115,
  96,
  129,
  79,
  220,
  34,
  42,
  144,
  136,
  70,
  238,
  184,
  20,
  222,
  94,
  11,
  219,
  224,
  50,
  58,
  10,
  73,
  6,
  36,
  92,
  194,
  211,
  172,
  98,
  145,
  149,
  228,
  121,
  231,
  200,
  55,
  109,
  141,
  213,
  78,
  169,
  108,
  86,
  244,
  234,
  101,
  122,
  174,
  8,
  186,
  120,
  37,
  46,
  28,
  166,
  180,
  198,
  232,
  221,
  116,
  31,
  75,
  189,
  139,
  138,
  112,
  62,
  181,
  102,
  72,
  3,
  246,
  14,
  97,
  53,
  87,
  185,
  134,
  193,
  29,
  158,
  225,
  248,
  152,
  17,
  105,
  217,
  142,
  148,
  155,
  30,
  135,
  233,
  206,
  85,
  40,
  223,
  140,
  161,
  137,
  13,
  191,
  230,
  66,
  104,
  65,
  153,
  45,
  15,
  176,
  84,
  187,
  22
]);
var Rcon = [
  [0, 0, 0, 0],
  [1, 0, 0, 0],
  [2, 0, 0, 0],
  [4, 0, 0, 0],
  [8, 0, 0, 0],
  [16, 0, 0, 0],
  [32, 0, 0, 0],
  [64, 0, 0, 0],
  [128, 0, 0, 0],
  [27, 0, 0, 0],
  [54, 0, 0, 0]
].map((v3) => new Uint8Array(v3));
var mul2 = new Uint8Array(256);
var mul3 = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const m22 = (i << 1 ^ ((i & 128) === 0 ? 0 : 27)) & 255;
  mul2[i] = m22;
  mul3[i] = m22 ^ i;
}
var R = (() => {
  const r3 = new Uint8Array(16);
  r3[0] = 225;
  return r3;
})();

// node_modules/@bsv/sdk/dist/esm/src/primitives/SymmetricKey.js
var NODE_CRYPTO_SYM = (() => {
  const processLike = typeof globalThis === "undefined" ? void 0 : globalThis.process;
  const getBuiltinModule = processLike?.getBuiltinModule;
  if (typeof getBuiltinModule === "function") {
    try {
      const crypto = getBuiltinModule.call(processLike, "node:crypto");
      if (crypto != null)
        return crypto;
    } catch {
    }
  }
  try {
    if (typeof __require === "function") {
      return __require("node:crypto");
    }
  } catch {
  }
  return void 0;
})();
var NATIVE_AES_GCM_AVAILABLE = (() => {
  if (NODE_CRYPTO_SYM == null)
    return false;
  return typeof NODE_CRYPTO_SYM.createCipheriv === "function" && typeof NODE_CRYPTO_SYM.createDecipheriv === "function";
})();

// node_modules/@bsv/sdk/dist/esm/src/script/OP.js
var OP = {
  // push value
  OP_0: 0,
  // when two op codes have the same value, the top one will be used in standard ASM output
  OP_FALSE: 0,
  OP_PUSHDATA1: 76,
  OP_PUSHDATA2: 77,
  OP_PUSHDATA4: 78,
  OP_1NEGATE: 79,
  OP_RESERVED: 80,
  OP_1: 81,
  OP_TRUE: 81,
  OP_2: 82,
  OP_3: 83,
  OP_4: 84,
  OP_5: 85,
  OP_6: 86,
  OP_7: 87,
  OP_8: 88,
  OP_9: 89,
  OP_10: 90,
  OP_11: 91,
  OP_12: 92,
  OP_13: 93,
  OP_14: 94,
  OP_15: 95,
  OP_16: 96,
  // control
  OP_NOP: 97,
  OP_VER: 98,
  OP_IF: 99,
  OP_NOTIF: 100,
  OP_VERIF: 101,
  OP_VERNOTIF: 102,
  OP_ELSE: 103,
  OP_ENDIF: 104,
  OP_VERIFY: 105,
  OP_RETURN: 106,
  // stack ops
  OP_TOALTSTACK: 107,
  OP_FROMALTSTACK: 108,
  OP_2DROP: 109,
  OP_2DUP: 110,
  OP_3DUP: 111,
  OP_2OVER: 112,
  OP_2ROT: 113,
  OP_2SWAP: 114,
  OP_IFDUP: 115,
  OP_DEPTH: 116,
  OP_DROP: 117,
  OP_DUP: 118,
  OP_NIP: 119,
  OP_OVER: 120,
  OP_PICK: 121,
  OP_ROLL: 122,
  OP_ROT: 123,
  OP_SWAP: 124,
  OP_TUCK: 125,
  // data manipulation ops
  OP_CAT: 126,
  OP_SPLIT: 127,
  // after monolith upgrade (May 2018)
  OP_NUM2BIN: 128,
  // after monolith upgrade (May 2018)
  OP_BIN2NUM: 129,
  // after monolith upgrade (May 2018)
  OP_SIZE: 130,
  // bit logic
  OP_INVERT: 131,
  OP_AND: 132,
  OP_OR: 133,
  OP_XOR: 134,
  OP_EQUAL: 135,
  OP_EQUALVERIFY: 136,
  OP_RESERVED1: 137,
  OP_RESERVED2: 138,
  // numeric
  OP_1ADD: 139,
  OP_1SUB: 140,
  OP_2MUL: 141,
  OP_2DIV: 142,
  OP_NEGATE: 143,
  OP_ABS: 144,
  OP_NOT: 145,
  OP_0NOTEQUAL: 146,
  OP_ADD: 147,
  OP_SUB: 148,
  OP_MUL: 149,
  OP_DIV: 150,
  OP_MOD: 151,
  OP_LSHIFT: 152,
  OP_RSHIFT: 153,
  OP_BOOLAND: 154,
  OP_BOOLOR: 155,
  OP_NUMEQUAL: 156,
  OP_NUMEQUALVERIFY: 157,
  OP_NUMNOTEQUAL: 158,
  OP_LESSTHAN: 159,
  OP_GREATERTHAN: 160,
  OP_LESSTHANOREQUAL: 161,
  OP_GREATERTHANOREQUAL: 162,
  OP_MIN: 163,
  OP_MAX: 164,
  OP_WITHIN: 165,
  // crypto
  OP_RIPEMD160: 166,
  OP_SHA1: 167,
  OP_SHA256: 168,
  OP_HASH160: 169,
  OP_HASH256: 170,
  OP_CODESEPARATOR: 171,
  OP_CHECKSIG: 172,
  OP_CHECKSIGVERIFY: 173,
  OP_CHECKMULTISIG: 174,
  OP_CHECKMULTISIGVERIFY: 175,
  // expansion
  OP_NOP1: 176,
  OP_CHECKLOCKTIMEVERIFY: 177,
  // BIP65 - on BSV post-genesis acts as NOP
  OP_NOP2: 177,
  // alias for OP_CHECKLOCKTIMEVERIFY
  OP_CHECKSEQUENCEVERIFY: 178,
  // BIP112 - on BSV post-genesis acts as NOP
  OP_NOP3: 178,
  // alias for OP_CHECKSEQUENCEVERIFY
  OP_SUBSTR: 179,
  // restored in 2026 CHRONICLE upgrade (was OP_NOP4)
  OP_NOP4: 179,
  // alias for OP_SUBSTR
  OP_LEFT: 180,
  // restored in 2026 CHRONICLE upgrade (was OP_NOP5)
  OP_NOP5: 180,
  // alias for OP_LEFT
  OP_RIGHT: 181,
  // restored in 2026 CHRONICLE upgrade (was OP_NOP6)
  OP_NOP6: 181,
  // alias for OP_RIGHT
  OP_LSHIFTNUM: 182,
  // restored in 2026 CHRONICLE upgrade (was OP_NOP7)
  OP_NOP7: 182,
  // alias for OP_LSHIFTNUM
  OP_RSHIFTNUM: 183,
  // restored in 2026 CHRONICLE upgrade (was OP_NOP8)
  OP_NOP8: 183,
  // alias for OP_RSHIFTNUM
  OP_NOP9: 184,
  OP_NOP10: 185,
  // 0xba–0xf9 are FIRST_UNDEFINED_OP_VALUE in node v1.2.0 and return SCRIPT_ERR_BAD_OPCODE
  // when executed. The names below are retained for ASM parsing/serialisation only.
  OP_NOP11: 186,
  OP_NOP12: 187,
  OP_NOP13: 188,
  OP_NOP14: 189,
  OP_NOP15: 190,
  OP_NOP16: 191,
  OP_NOP17: 192,
  OP_NOP18: 193,
  OP_NOP19: 194,
  OP_NOP20: 195,
  OP_NOP21: 196,
  OP_NOP22: 197,
  OP_NOP23: 198,
  OP_NOP24: 199,
  OP_NOP25: 200,
  OP_NOP26: 201,
  OP_NOP27: 202,
  OP_NOP28: 203,
  OP_NOP29: 204,
  OP_NOP30: 205,
  OP_NOP31: 206,
  OP_NOP32: 207,
  OP_NOP33: 208,
  OP_NOP34: 209,
  OP_NOP35: 210,
  OP_NOP36: 211,
  OP_NOP37: 212,
  OP_NOP38: 213,
  OP_NOP39: 214,
  OP_NOP40: 215,
  OP_NOP41: 216,
  OP_NOP42: 217,
  OP_NOP43: 218,
  OP_NOP44: 219,
  OP_NOP45: 220,
  OP_NOP46: 221,
  OP_NOP47: 222,
  OP_NOP48: 223,
  OP_NOP49: 224,
  OP_NOP50: 225,
  OP_NOP51: 226,
  OP_NOP52: 227,
  OP_NOP53: 228,
  OP_NOP54: 229,
  OP_NOP55: 230,
  OP_NOP56: 231,
  OP_NOP57: 232,
  OP_NOP58: 233,
  OP_NOP59: 234,
  OP_NOP60: 235,
  OP_NOP61: 236,
  OP_NOP62: 237,
  OP_NOP63: 238,
  OP_NOP64: 239,
  OP_NOP65: 240,
  OP_NOP66: 241,
  OP_NOP67: 242,
  OP_NOP68: 243,
  OP_NOP69: 244,
  OP_NOP70: 245,
  OP_NOP71: 246,
  OP_NOP72: 247,
  OP_NOP73: 248,
  OP_NOP77: 252,
  // template matching params (not executable opcodes; 0xf9 was removed from node v1.2.0 opcodes.h
  // but retained here for ASM round-trip compatibility)
  OP_SMALLDATA: 249,
  OP_SMALLINTEGER: 250,
  OP_PUBKEYS: 251,
  OP_PUBKEYHASH: 253,
  OP_PUBKEY: 254,
  OP_INVALIDOPCODE: 255
};
for (const name in OP) {
  if (OP[OP[name]] === void 0)
    OP[OP[name]] = name;
}
var OP_default = OP;

// node_modules/@bsv/sdk/dist/esm/src/script/Script.js
var BufferCtor4 = typeof globalThis === "undefined" ? void 0 : globalThis.Buffer;
var Script = class _Script {
  _chunks;
  parsed;
  rawBytesCache;
  hexCache;
  /**
   * @method fromASM
   * Static method to construct a Script instance from an ASM (Assembly) formatted string.
   * @param asm - The script in ASM string format.
   * @returns A new Script instance.
   * @example
   * const script = Script.fromASM("OP_DUP OP_HASH160 abcd... OP_EQUALVERIFY OP_CHECKSIG")
   */
  static fromASM(asm) {
    const chunks = [];
    const tokens = asm.split(" ");
    let i = 0;
    while (i < tokens.length) {
      const { chunk, advance } = _Script.parseASMToken(tokens, i);
      chunks.push(chunk);
      i += advance;
    }
    return new _Script(chunks);
  }
  static pushdataOpCodeNum(len) {
    if (len >= 0 && len < OP_default.OP_PUSHDATA1)
      return len;
    if (len < Math.pow(2, 8))
      return OP_default.OP_PUSHDATA1;
    if (len < Math.pow(2, 16))
      return OP_default.OP_PUSHDATA2;
    return OP_default.OP_PUSHDATA4;
  }
  static parseASMToken(tokens, i) {
    const token = tokens[i];
    if (token === "0")
      return { chunk: { op: 0 }, advance: 1 };
    if (token === "-1")
      return { chunk: { op: OP_default.OP_1NEGATE }, advance: 1 };
    const isKnownOp = token.startsWith("OP_") && OP_default[token] !== void 0;
    const opCodeNum = isKnownOp ? OP_default[token] : 0;
    if (opCodeNum === OP_default.OP_PUSHDATA1 || opCodeNum === OP_default.OP_PUSHDATA2 || opCodeNum === OP_default.OP_PUSHDATA4) {
      return { chunk: { data: toArray2(tokens[i + 2], "hex"), op: opCodeNum }, advance: 3 };
    }
    if (!isKnownOp) {
      let hex = token;
      if (hex.length % 2 !== 0)
        hex = "0" + hex;
      const arr = toArray2(hex, "hex");
      if (encode(arr, "hex") !== hex) {
        throw new Error("invalid hex string in script");
      }
      return { chunk: { data: arr, op: _Script.pushdataOpCodeNum(arr.length) }, advance: 1 };
    }
    return { chunk: { op: opCodeNum }, advance: 1 };
  }
  /**
   * @method fromHex
   * Static method to construct a Script instance from a hexadecimal string.
   * @param hex - The script in hexadecimal format.
   * @returns A new Script instance.
   * @example
   * const script = Script.fromHex("76a9...");
   */
  static fromHex(hex) {
    if (hex.length === 0)
      return _Script.fromBinary([]);
    if (hex.length % 2 !== 0) {
      throw new Error("There is an uneven number of characters in the string which suggests it is not hex encoded.");
    }
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
      throw new Error("Some elements in this string are not hex encoded.");
    }
    const bin = toArray2(hex, "hex");
    const rawBytes = Uint8Array.from(bin);
    return new _Script([], rawBytes, hex.toLowerCase(), false);
  }
  /**
   * @method fromBinary
   * Static method to construct a Script instance from a binary array.
   * @param bin - The script in binary array format.
   * @returns A new Script instance.
   * @example
   * const script = Script.fromBinary([0x76, 0xa9, ...])
   */
  static fromBinary(bin) {
    const rawBytes = Uint8Array.from(bin);
    return new _Script([], rawBytes, void 0, false);
  }
  /**
   * @constructor
   * Constructs a new Script object.
   * @param chunks=[] - An array of script chunks to directly initialize the script.
   * @param rawBytesCache - Optional serialized bytes that can be reused instead of reserializing `chunks`.
   * @param hexCache - Optional lowercase hex string that matches the serialized bytes, used to satisfy `toHex` quickly.
   * @param parsed - When false the script defers parsing `rawBytesCache` until `chunks` is accessed; defaults to true.
   */
  constructor(chunks = [], rawBytesCache, hexCache, parsed = true) {
    this._chunks = chunks;
    this.parsed = parsed;
    this.rawBytesCache = rawBytesCache;
    this.hexCache = hexCache;
  }
  get chunks() {
    this.ensureParsed();
    return this._chunks;
  }
  set chunks(value) {
    this._chunks = value;
    this.parsed = true;
    this.invalidateSerializationCaches();
  }
  ensureParsed() {
    if (this.parsed)
      return;
    if (this.rawBytesCache != null) {
      this._chunks = _Script.parseChunks(this.rawBytesCache);
    } else {
      this._chunks = [];
    }
    this.parsed = true;
  }
  /**
   * @method toASM
   * Serializes the script to an ASM formatted string.
   * @returns The script in ASM string format.
   */
  toASM() {
    let str = "";
    for (const chunk of this.chunks) {
      str += this._chunkToString(chunk);
    }
    return str.slice(1);
  }
  /**
   * @method toHex
   * Serializes the script to a hexadecimal string.
   * @returns The script in hexadecimal format.
   */
  toHex() {
    if (this.hexCache != null) {
      return this.hexCache;
    }
    this.rawBytesCache ??= this.serializeChunksToBytes();
    const hex = BufferCtor4 == null ? encode(Array.from(this.rawBytesCache), "hex") : BufferCtor4.from(this.rawBytesCache).toString("hex");
    this.hexCache = hex;
    return hex;
  }
  /**
   * @method toBinary
   * Serializes the script to a binary array.
   * @returns The script in binary array format.
   */
  toBinary() {
    return Array.from(this.toUint8Array());
  }
  toUint8Array() {
    this.rawBytesCache ??= this.serializeChunksToBytes();
    return this.rawBytesCache;
  }
  /**
   * @method writeScript
   * Appends another script to this script.
   * @param script - The script to append.
   * @returns This script instance for chaining.
   */
  writeScript(script) {
    this.invalidateSerializationCaches();
    this.chunks = this.chunks.concat(script.chunks);
    return this;
  }
  /**
   * @method writeOpCode
   * Appends an opcode to the script.
   * @param op - The opcode to append.
   * @returns This script instance for chaining.
   */
  writeOpCode(op) {
    this.invalidateSerializationCaches();
    this.chunks.push({ op });
    return this;
  }
  /**
   * @method setChunkOpCode
   * Sets the opcode of a specific chunk in the script.
   * @param i - The index of the chunk.
   * @param op - The opcode to set.
   * @returns This script instance for chaining.
   */
  setChunkOpCode(i, op) {
    this.invalidateSerializationCaches();
    this.chunks[i] = { op };
    return this;
  }
  /**
   * @method writeBn
   * Appends a BigNumber to the script as an opcode.
   * @param bn - The BigNumber to append.
   * @returns This script instance for chaining.
   */
  writeBn(bn) {
    this.invalidateSerializationCaches();
    if (bn.cmpn(0) === OP_default.OP_0) {
      this.chunks.push({
        op: OP_default.OP_0
      });
    } else if (bn.cmpn(-1) === 0) {
      this.chunks.push({
        op: OP_default.OP_1NEGATE
      });
    } else if (bn.cmpn(1) >= 0 && bn.cmpn(16) <= 0) {
      this.chunks.push({
        op: bn.toNumber() + OP_default.OP_1 - 1
      });
    } else {
      const buf = bn.toSm("little");
      this.writeBin(buf);
    }
    return this;
  }
  /**
   * @method writeBin
   * Appends binary data to the script, determining the appropriate opcode based on length.
   * @param bin - The binary data to append.
   * @returns This script instance for chaining.
   * @throws {Error} Throws an error if the data is too large to be pushed.
   */
  writeBin(bin) {
    this.invalidateSerializationCaches();
    let op;
    const data = bin.length > 0 ? bin : void 0;
    if (bin.length > 0 && bin.length < OP_default.OP_PUSHDATA1) {
      op = bin.length;
    } else if (bin.length === 0) {
      op = OP_default.OP_0;
    } else if (bin.length < Math.pow(2, 8)) {
      op = OP_default.OP_PUSHDATA1;
    } else if (bin.length < Math.pow(2, 16)) {
      op = OP_default.OP_PUSHDATA2;
    } else if (bin.length < Math.pow(2, 32)) {
      op = OP_default.OP_PUSHDATA4;
    } else {
      throw new Error("You can't push that much data");
    }
    this.chunks.push({
      data,
      op
    });
    return this;
  }
  /**
   * @method writeNumber
   * Appends a number to the script.
   * @param num - The number to append.
   * @returns This script instance for chaining.
   */
  writeNumber(num) {
    this.invalidateSerializationCaches();
    this.writeBn(new BigNumber(num));
    return this;
  }
  /**
   * @method removeCodeseparators
   * Removes all OP_CODESEPARATOR opcodes from the script.
   * @returns This script instance for chaining.
   */
  removeCodeseparators() {
    const bytes2 = this.toUint8Array();
    this.rawBytesCache = Uint8Array.from(_Script.removeOpcodeBytes(bytes2, OP_default.OP_CODESEPARATOR));
    this.hexCache = void 0;
    this._chunks = [];
    this.parsed = false;
    return this;
  }
  /**
   * Deletes the given item wherever it appears in the current script.
   *
   * @param script - The script containing the item to delete from the current script.
   *
   * @returns This script instance for chaining.
   */
  findAndDelete(script) {
    this.invalidateSerializationCaches();
    const targetBytes = script.toUint8Array();
    const targetLen = targetBytes.length;
    if (targetLen === 0)
      return this;
    const targetOp = targetBytes[0] ?? 0;
    const matchesChunk = (chunk) => {
      if (chunk.op !== targetOp)
        return false;
      const dataArr = chunk.data ?? [];
      const dataLen = dataArr.length;
      if (dataLen === 0) {
        return targetLen === 1;
      }
      if (chunk.op === OP_default.OP_RETURN) {
        if (targetLen !== 1 + dataLen)
          return false;
        for (let j2 = 0; j2 < dataLen; j2++) {
          if (targetBytes[1 + j2] !== dataArr[j2])
            return false;
        }
        return true;
      }
      if (chunk.op < OP_default.OP_PUSHDATA1) {
        if (targetLen !== 1 + dataLen)
          return false;
        for (let j2 = 0; j2 < dataLen; j2++) {
          if (targetBytes[1 + j2] !== dataArr[j2])
            return false;
        }
        return true;
      }
      if (chunk.op === OP_default.OP_PUSHDATA1) {
        if (targetLen !== 2 + dataLen)
          return false;
        if (targetBytes[1] !== (dataLen & 255))
          return false;
        for (let j2 = 0; j2 < dataLen; j2++) {
          if (targetBytes[2 + j2] !== dataArr[j2])
            return false;
        }
        return true;
      }
      if (chunk.op === OP_default.OP_PUSHDATA2) {
        if (targetLen !== 3 + dataLen)
          return false;
        if (targetBytes[1] !== (dataLen & 255))
          return false;
        if (targetBytes[2] !== (dataLen >> 8 & 255))
          return false;
        for (let j2 = 0; j2 < dataLen; j2++) {
          if (targetBytes[3 + j2] !== dataArr[j2])
            return false;
        }
        return true;
      }
      if (chunk.op === OP_default.OP_PUSHDATA4) {
        if (targetLen !== 5 + dataLen)
          return false;
        const size = dataLen >>> 0;
        if (targetBytes[1] !== (size & 255))
          return false;
        if (targetBytes[2] !== (size >> 8 & 255))
          return false;
        if (targetBytes[3] !== (size >> 16 & 255))
          return false;
        if (targetBytes[4] !== (size >> 24 & 255))
          return false;
        for (let j2 = 0; j2 < dataLen; j2++) {
          if (targetBytes[5 + j2] !== dataArr[j2])
            return false;
        }
        return true;
      }
      return false;
    };
    for (let i = 0; i < this.chunks.length; ) {
      if (matchesChunk(this.chunks[i])) {
        this.chunks.splice(i, 1);
      } else {
        i++;
      }
    }
    return this;
  }
  /**
   * @method isPushOnly
   * Checks if the script contains only push data operations.
   * @returns True if the script is push-only, otherwise false.
   */
  isPushOnly() {
    for (const chunk of this.chunks) {
      const opCodeNum = chunk.op;
      if (opCodeNum > OP_default.OP_16) {
        return false;
      }
    }
    return true;
  }
  /**
   * @method isLockingScript
   * Determines if the script is a locking script.
   * @returns True if the script is a locking script, otherwise false.
   */
  isLockingScript() {
    throw new Error("Not implemented");
  }
  /**
   * @method isUnlockingScript
   * Determines if the script is an unlocking script.
   * @returns True if the script is an unlocking script, otherwise false.
   */
  isUnlockingScript() {
    throw new Error("Not implemented");
  }
  /**
   * @private
   * @method _chunkToString
   * Converts a script chunk to its string representation.
   * @param chunk - The script chunk.
   * @returns The string representation of the chunk.
   */
  static computeSerializedLength(chunks) {
    let total = 0;
    for (const chunk of chunks) {
      total += 1;
      if (chunk.data == null)
        continue;
      const len = chunk.data.length;
      if (chunk.op === OP_default.OP_RETURN) {
        total += len;
        break;
      }
      if (chunk.op < OP_default.OP_PUSHDATA1) {
        total += len;
      } else if (chunk.op === OP_default.OP_PUSHDATA1) {
        total += 1 + len;
      } else if (chunk.op === OP_default.OP_PUSHDATA2) {
        total += 2 + len;
      } else if (chunk.op === OP_default.OP_PUSHDATA4) {
        total += 4 + len;
      }
    }
    return total;
  }
  serializeChunksToBytes() {
    const chunks = this.chunks;
    const totalLength = _Script.computeSerializedLength(chunks);
    const bytes2 = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes2[offset++] = chunk.op;
      if (chunk.data == null)
        continue;
      if (chunk.op === OP_default.OP_RETURN) {
        bytes2.set(chunk.data, offset);
        break;
      }
      offset = _Script.writeChunkData(bytes2, offset, chunk.op, chunk.data);
    }
    return bytes2;
  }
  invalidateSerializationCaches() {
    this.rawBytesCache = void 0;
    this.hexCache = void 0;
  }
  static writeChunkData(target, offset, op, data) {
    const len = data.length;
    if (op < OP_default.OP_PUSHDATA1) {
      target.set(data, offset);
      return offset + len;
    } else if (op === OP_default.OP_PUSHDATA1) {
      target[offset++] = len & 255;
      target.set(data, offset);
      return offset + len;
    } else if (op === OP_default.OP_PUSHDATA2) {
      target[offset++] = len & 255;
      target[offset++] = len >> 8 & 255;
      target.set(data, offset);
      return offset + len;
    } else if (op === OP_default.OP_PUSHDATA4) {
      const size = len >>> 0;
      target[offset++] = size & 255;
      target[offset++] = size >> 8 & 255;
      target[offset++] = size >> 16 & 255;
      target[offset++] = size >> 24 & 255;
      target.set(data, offset);
      return offset + len;
    }
    return offset;
  }
  /**
   * Reads pushdata length bytes from `bytes` at `pos` and returns the resulting
   * `{ len, newPos, hasLength }` for a given opcode. Does not read the actual data.
   */
  static readPushdataLength(op, bytes2, pos, length) {
    if (op > 0 && op < OP_default.OP_PUSHDATA1) {
      return { len: op, newPos: pos, hasLength: true };
    }
    if (op === OP_default.OP_PUSHDATA1) {
      const hasLength2 = pos < length;
      const len2 = hasLength2 ? bytes2[pos++] ?? 0 : 0;
      return { len: len2, newPos: pos, hasLength: hasLength2 };
    }
    if (op === OP_default.OP_PUSHDATA2) {
      const hasLength2 = pos + 1 < length;
      const len2 = (bytes2[pos] ?? 0) | (bytes2[pos + 1] ?? 0) << 8;
      return { len: len2, newPos: Math.min(pos + 2, length), hasLength: hasLength2 };
    }
    const hasLength = pos + 3 < length;
    const len = ((bytes2[pos] ?? 0) | (bytes2[pos + 1] ?? 0) << 8 | (bytes2[pos + 2] ?? 0) << 16 | (bytes2[pos + 3] ?? 0) << 24) >>> 0;
    return { len, newPos: Math.min(pos + 4, length), hasLength };
  }
  static parseChunks(bytes2) {
    const chunks = [];
    const length = bytes2.length;
    let pos = 0;
    let inConditionalBlock = 0;
    while (pos < length) {
      const op = bytes2[pos++] ?? 0;
      if (op === OP_default.OP_RETURN && inConditionalBlock === 0) {
        chunks.push({ op, data: _Script.copyRange(bytes2, pos, length) });
        break;
      }
      if (op === OP_default.OP_IF || op === OP_default.OP_NOTIF || op === OP_default.OP_VERIF || op === OP_default.OP_VERNOTIF) {
        inConditionalBlock++;
      } else if (op === OP_default.OP_ENDIF) {
        inConditionalBlock--;
      }
      if (op > 0 && op <= OP_default.OP_PUSHDATA4) {
        const { len, newPos, hasLength } = _Script.readPushdataLength(op, bytes2, pos, length);
        pos = newPos;
        const end = Math.min(pos + len, length);
        const invalidLength = !hasLength || end - pos !== len;
        chunks.push({ data: _Script.copyRange(bytes2, pos, end), op, invalidLength });
        pos = end;
      } else {
        chunks.push({ op });
      }
    }
    return chunks;
  }
  static removeOpcodeBytes(bytes2, opcode) {
    const out = [];
    const length = bytes2.length;
    let pos = 0;
    while (pos < length) {
      const start = pos;
      const op = bytes2[pos++] ?? 0;
      if (op > 0 && op <= OP_default.OP_PUSHDATA4) {
        const { len, newPos } = _Script.readPushdataLength(op, bytes2, pos, length);
        pos = newPos;
        const end = Math.min(pos + len, length);
        if (op !== opcode) {
          for (let i = start; i < end; i++)
            out.push(bytes2[i] ?? 0);
        }
        pos = end;
      } else if (op !== opcode) {
        out.push(op);
      }
    }
    return out;
  }
  static copyRange(bytes2, start, end) {
    const size = Math.max(end - start, 0);
    const data = new Array(size);
    for (let i = 0; i < size; i++) {
      data[i] = bytes2[start + i] ?? 0;
    }
    return data;
  }
  _chunkToString(chunk) {
    const op = chunk.op;
    let str = "";
    if (chunk.data === void 0) {
      const val = OP_default[op];
      str = `${str} ${val}`;
    } else {
      str = `${str} ${toHex(chunk.data)}`;
    }
    return str;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/TransactionSignature.js
var EMPTY_SCRIPT = new Uint8Array(0);
var TransactionSignature = class _TransactionSignature extends Signature {
  static SIGHASH_ALL = 1;
  static SIGHASH_NONE = 2;
  static SIGHASH_SINGLE = 3;
  static SIGHASH_CHRONICLE = 32;
  static SIGHASH_FORKID = 64;
  static SIGHASH_ANYONECANPAY = 128;
  scope;
  /**
   * Implements the original bitcoin transaction signature digest preimage algorithm (OTDA).
   * @param params
   * @returns preimage as a byte array
   */
  static formatOTDA(params) {
    const isAnyoneCanPay = (params.scope & _TransactionSignature.SIGHASH_ANYONECANPAY) === _TransactionSignature.SIGHASH_ANYONECANPAY;
    const isSingle = (params.scope & 31) === _TransactionSignature.SIGHASH_SINGLE;
    const isNone = (params.scope & 31) === _TransactionSignature.SIGHASH_NONE;
    const isAll = (params.scope & 31) === _TransactionSignature.SIGHASH_ALL || !isSingle && !isNone;
    const subscript = Script.fromBinary(params.subscript.toBinary());
    subscript.removeCodeseparators();
    const currentInput = {
      sourceTXID: params.sourceTXID,
      sourceOutputIndex: params.sourceOutputIndex,
      sequence: params.inputSequence,
      script: subscript.toBinary()
    };
    const writer = new Writer();
    function writeInputs(inputs) {
      writer.writeVarIntNum(inputs.length);
      for (const input of inputs) {
        writer.writeReverse(toArray2(input.sourceTXID, "hex"));
        writer.writeUInt32LE(input.sourceOutputIndex);
        writer.writeVarIntNum(input.script.length);
        writer.write(input.script);
        writer.writeUInt32LE(input.sequence);
      }
    }
    function writeOutputs(outputs) {
      writer.writeVarIntNum(outputs.length);
      for (const output of outputs) {
        writer.writeUInt64LE(output.satoshis);
        writer.writeVarIntNum(output.script.length);
        writer.write(output.script);
      }
    }
    writer.writeInt32LE(params.transactionVersion);
    const emptyScript = new Script().toBinary();
    if (!isAnyoneCanPay) {
      const inputs = params.otherInputs.map((input) => ({
        sourceTXID: input.sourceTXID ?? input.sourceTransaction?.id("hex") ?? "",
        sourceOutputIndex: input.sourceOutputIndex,
        sequence: isSingle || isNone ? 0 : input.sequence ?? 4294967295,
        // Default to max sequence number
        script: emptyScript
      }));
      inputs.splice(params.inputIndex, 0, currentInput);
      writeInputs(inputs);
    } else if (isAnyoneCanPay) {
      writeInputs([currentInput]);
    }
    if (isAll) {
      const outputs = params.outputs.map((output) => ({
        satoshis: output.satoshis ?? 0,
        // Default to 0 if undefined
        script: output.lockingScript.toBinary()
      }));
      writeOutputs(outputs);
    } else if (isSingle) {
      const outputs = [];
      for (let i = 0; i < params.inputIndex; i++)
        outputs.push({ satoshis: -1, script: emptyScript });
      const o5 = params.outputs[params.inputIndex];
      if (o5 !== void 0) {
        outputs.push({ satoshis: o5.satoshis ?? 0, script: o5.lockingScript.toBinary() });
      }
      writeOutputs(outputs);
    } else if (isNone) {
      writeOutputs([]);
    }
    writer.writeUInt32LE(params.lockTime);
    writer.writeUInt32LE(params.scope >>> 0);
    const buf = writer.toUint8Array();
    return buf;
  }
  /**
   * Formats the same SIGHASH preimage bytes as `format`, supporting the optional cache for hash reuse.
   * @param params - Context for the signing operation.
   * @param params.cache - Optional `SignatureHashCache` that may already contain hashed prefixes and is populated during formatting.
   * @returns Bytes for signing.
   */
  static formatBip143(params) {
    const cache = params.cache;
    const currentInput = {
      sourceTXID: params.sourceTXID,
      sourceOutputIndex: params.sourceOutputIndex,
      sequence: params.inputSequence
    };
    const inputs = [...params.otherInputs];
    inputs.splice(params.inputIndex, 0, currentInput);
    const getPrevoutHash = () => {
      const writer2 = new Writer();
      for (const input of inputs) {
        if (input.sourceTXID === void 0) {
          if (input.sourceTransaction == null) {
            throw new Error("Missing sourceTransaction for input");
          }
          writer2.write(input.sourceTransaction.hash());
        } else {
          writer2.writeReverse(toArray2(input.sourceTXID, "hex"));
        }
        writer2.writeUInt32LE(input.sourceOutputIndex);
      }
      const buf2 = writer2.toUint8Array();
      const ret = hash256(buf2);
      return ret;
    };
    const getSequenceHash = () => {
      const writer2 = new Writer();
      for (const input of inputs) {
        const sequence = input.sequence ?? 4294967295;
        writer2.writeUInt32LE(sequence);
      }
      const buf2 = writer2.toUint8Array();
      const ret = hash256(buf2);
      return ret;
    };
    function getOutputsHash(outputIndex) {
      const writer2 = new Writer();
      if (outputIndex === void 0) {
        for (const output of params.outputs) {
          const satoshis = output.satoshis ?? 0;
          writer2.writeUInt64LE(satoshis);
          const script = output.lockingScript?.toUint8Array() ?? EMPTY_SCRIPT;
          writer2.writeVarIntNum(script.length);
          writer2.write(script);
        }
      } else {
        const output = params.outputs[outputIndex];
        if (output === void 0) {
          throw new Error(`Output at index ${outputIndex} does not exist`);
        }
        const satoshis = output.satoshis ?? 0;
        writer2.writeUInt64LE(satoshis);
        const script = output.lockingScript?.toUint8Array() ?? EMPTY_SCRIPT;
        writer2.writeVarIntNum(script.length);
        writer2.write(script);
      }
      const buf2 = writer2.toUint8Array();
      const ret = hash256(buf2);
      return ret;
    }
    let hashPrevouts = new Array(32).fill(0);
    let hashSequence = new Array(32).fill(0);
    let hashOutputs = new Array(32).fill(0);
    if ((params.scope & _TransactionSignature.SIGHASH_ANYONECANPAY) === 0) {
      if (cache?.hashPrevouts == null) {
        hashPrevouts = getPrevoutHash();
        if (cache != null)
          cache.hashPrevouts = hashPrevouts;
      } else {
        hashPrevouts = cache.hashPrevouts;
      }
    }
    if ((params.scope & _TransactionSignature.SIGHASH_ANYONECANPAY) === 0 && (params.scope & 31) !== _TransactionSignature.SIGHASH_SINGLE && (params.scope & 31) !== _TransactionSignature.SIGHASH_NONE) {
      if (cache?.hashSequence == null) {
        hashSequence = getSequenceHash();
        if (cache != null)
          cache.hashSequence = hashSequence;
      } else {
        hashSequence = cache.hashSequence;
      }
    }
    if ((params.scope & 31) !== _TransactionSignature.SIGHASH_SINGLE && (params.scope & 31) !== _TransactionSignature.SIGHASH_NONE) {
      if (cache?.hashOutputsAll == null) {
        hashOutputs = getOutputsHash();
        if (cache != null)
          cache.hashOutputsAll = hashOutputs;
      } else {
        hashOutputs = cache.hashOutputsAll;
      }
    } else if ((params.scope & 31) === _TransactionSignature.SIGHASH_SINGLE && params.inputIndex < params.outputs.length) {
      const key = params.inputIndex;
      const cachedSingle = cache?.hashOutputsSingle?.get(key);
      if (cachedSingle == null) {
        hashOutputs = getOutputsHash(key);
        if (cache != null) {
          cache.hashOutputsSingle ??= /* @__PURE__ */ new Map();
          cache.hashOutputsSingle.set(key, hashOutputs);
        }
      } else {
        hashOutputs = cachedSingle;
      }
    }
    const writer = new Writer();
    writer.writeInt32LE(params.transactionVersion);
    writer.write(hashPrevouts);
    writer.write(hashSequence);
    writer.writeReverse(toArray2(params.sourceTXID, "hex"));
    writer.writeUInt32LE(params.sourceOutputIndex);
    const subscriptBin = params.subscript.toUint8Array();
    writer.writeVarIntNum(subscriptBin.length);
    writer.write(subscriptBin);
    writer.writeUInt64LE(params.sourceSatoshis);
    const sequenceNumber = currentInput.sequence;
    writer.writeUInt32LE(sequenceNumber);
    writer.write(hashOutputs);
    writer.writeUInt32LE(params.lockTime);
    writer.writeUInt32LE(params.scope >>> 0);
    const buf = writer.toUint8Array();
    return buf;
  }
  /**
   * Formats the SIGHASH preimage for the targeted input, optionally using a cache to skip recomputing shared hash prefixes.
   * @param params - Context for the signing input plus transaction metadata.
   * @param params.cache - Optional cache storing previously computed `hashPrevouts`, `hashSequence`, or `hashOutputs*` values; it will be populated if present.
   */
  static format(params) {
    return Array.from(this.formatBytes(params));
  }
  static formatBytes(params) {
    const hasForkId = (params.scope & _TransactionSignature.SIGHASH_FORKID) !== 0;
    const hasChronicle = params.ignoreChronicle !== true && (params.scope & _TransactionSignature.SIGHASH_CHRONICLE) !== 0;
    if (hasForkId && !hasChronicle) {
      return _TransactionSignature.formatBip143(params);
    }
    if (!hasForkId || hasForkId && hasChronicle) {
      return _TransactionSignature.formatOTDA(params);
    }
    return new Uint8Array(0);
  }
  static usesOtdaSingleBug(params) {
    const hasForkId = (params.scope & _TransactionSignature.SIGHASH_FORKID) !== 0;
    const hasChronicle = params.ignoreChronicle !== true && (params.scope & _TransactionSignature.SIGHASH_CHRONICLE) !== 0;
    const usesOtda = !hasForkId || hasForkId && hasChronicle;
    return usesOtda && (params.scope & 31) === _TransactionSignature.SIGHASH_SINGLE && params.inputIndex >= params.outputs.length;
  }
  // The format used in a tx
  static fromChecksigFormat(buf) {
    if (buf.length === 0) {
      const r3 = new BigNumber(1);
      const s4 = new BigNumber(1);
      const scope2 = 1;
      return new _TransactionSignature(r3, s4, scope2);
    }
    const scope = buf.at(-1);
    const derbuf = buf.slice(0, buf.length - 1);
    const tempSig = Signature.fromDER(derbuf);
    return new _TransactionSignature(tempSig.r, tempSig.s, scope);
  }
  constructor(r3, s4, scope) {
    super(r3, s4);
    this.scope = scope;
  }
  /**
   * Compares to bitcoind's IsLowDERSignature
   * See also Ecdsa signature algorithm which enforces this.
   * See also Bip 62, "low S values in signatures"
   */
  hasLowS() {
    if (this.s.ltn(1) || this.s.gt(new BigNumber("7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0", "hex"))) {
      return false;
    }
    return true;
  }
  toChecksigFormat() {
    const derbuf = this.toDER();
    return [...derbuf, this.scope];
  }
};

// node_modules/@bsv/sdk/dist/esm/src/primitives/Secp256r1.js
var P = BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff");
var N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
var A = P - 3n;
var B = BigInt("0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b");
var GX = BigInt("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296");
var GY = BigInt("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5");
var HALF_N = N >> 1n;

// node_modules/@bsv/sdk/dist/esm/src/script/LockingScript.js
var LockingScript = class extends Script {
  /**
   * @method isLockingScript
   * Determines if the script is a locking script.
   * @returns {boolean} Always returns true for a LockingScript instance.
   */
  isLockingScript() {
    return true;
  }
  /**
   * @method isUnlockingScript
   * Determines if the script is an unlocking script.
   * @returns {boolean} Always returns false for a LockingScript instance.
   */
  isUnlockingScript() {
    return false;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/script/UnlockingScript.js
var UnlockingScript = class extends Script {
  /**
   * @method isLockingScript
   * Determines if the script is a locking script.
   * @returns {boolean} Always returns false for an UnlockingScript instance.
   */
  isLockingScript() {
    return false;
  }
  /**
   * @method isUnlockingScript
   * Determines if the script is an unlocking script.
   * @returns {boolean} Always returns true for an UnlockingScript instance.
   */
  isUnlockingScript() {
    return true;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/script/ScriptEvaluationError.js
var ScriptEvaluationError = class extends Error {
  txid;
  outputIndex;
  context;
  programCounter;
  stackState;
  altStackState;
  ifStackState;
  stackMem;
  altStackMem;
  constructor(params) {
    const stackHex = params.stackState.map((s4) => s4 != null && s4.length !== void 0 ? toHex(s4) : s4 === null || s4 === void 0 ? "null/undef" : "INVALID_STACK_ITEM").join(", ");
    const altStackHex = params.altStackState.map((s4) => s4 != null && s4.length !== void 0 ? toHex(s4) : s4 === null || s4 === void 0 ? "null/undef" : "INVALID_STACK_ITEM").join(", ");
    const pcInfo = `Context: ${params.context}, PC: ${params.programCounter}`;
    const stackInfo = `Stack: [${stackHex}] (len: ${params.stackState.length}, mem: ${params.stackMem})`;
    const altStackInfo = `AltStack: [${altStackHex}] (len: ${params.altStackState.length}, mem: ${params.altStackMem})`;
    const ifStackInfo = `IfStack: [${params.ifStackState.join(", ")}]`;
    const fullMessage = `Script evaluation error: ${params.message}
TXID: ${params.txid}, OutputIdx: ${params.outputIndex}
${pcInfo}
${stackInfo}
${altStackInfo}
${ifStackInfo}`;
    super(fullMessage);
    this.name = this.constructor.name;
    this.txid = params.txid;
    this.outputIndex = params.outputIndex;
    this.context = params.context;
    this.programCounter = params.programCounter;
    this.stackState = params.stackState.map((s4) => s4.slice());
    this.altStackState = params.altStackState.map((s4) => s4.slice());
    this.ifStackState = params.ifStackState.slice();
    this.stackMem = params.stackMem;
    this.altStackMem = params.altStackMem;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/script/Spend.js
var maxScriptElementSize = 1024 * 1024 * 1024;
var maxScriptElementSizeBeforeGenesis = 520;
var maxScriptSizeBeforeGenesis = 1e4;
var maxOpsBeforeGenesis = 500;
var maxStackItemsBeforeGenesis = 1e3;
var maxMultisigKeyCount = Math.pow(2, 31) - 1;
var maxMultisigKeyCountBigInt = BigInt(maxMultisigKeyCount);
var maxMultisigKeyCountBeforeGenesis = 20;
var sequenceLocktimeDisableFlag = 2147483648;
var SCRIPTNUM_NEG_1 = Object.freeze(new BigNumber(-1).toScriptNum());
var SCRIPTNUMS_0_TO_16 = Object.freeze(Array.from({ length: 17 }, (_3, i) => Object.freeze(new BigNumber(i).toScriptNum())));
function compareNumberArrays(a4, b5) {
  if (a4.length !== b5.length)
    return false;
  for (let i = 0; i < a4.length; i++) {
    if (a4[i] !== b5[i])
      return false;
  }
  return true;
}
function isMinimallyEncodedHelper(buf, maxNumSize = Number.MAX_SAFE_INTEGER) {
  if (buf.length > maxNumSize) {
    return false;
  }
  if (buf.length > 0) {
    if ((buf.at(-1) & 127) === 0) {
      if (buf.length <= 1 || (buf.at(-2) & 128) === 0) {
        return false;
      }
    }
  }
  return true;
}
function isChecksigFormatHelper(buf) {
  if (buf.length < 9 || buf.length > 73)
    return false;
  if (buf[0] !== 48)
    return false;
  if (buf[1] !== buf.length - 3)
    return false;
  const rMarker = buf[2];
  const rLen = buf[3];
  if (rMarker !== 2)
    return false;
  if (rLen === 0)
    return false;
  if (5 + rLen >= buf.length)
    return false;
  const sMarkerOffset = 4 + rLen;
  const sMarker = buf[sMarkerOffset];
  const sLen = buf[sMarkerOffset + 1];
  if (sMarker !== 2)
    return false;
  if (sLen === 0)
    return false;
  if ((buf[4] & 128) !== 0)
    return false;
  if (rLen > 1 && buf[4] === 0 && (buf[5] & 128) === 0)
    return false;
  const sValueOffset = sMarkerOffset + 2;
  if ((buf[sValueOffset] & 128) !== 0)
    return false;
  if (sLen > 1 && buf[sValueOffset] === 0 && (buf[sValueOffset + 1] & 128) === 0)
    return false;
  if (rLen + sLen + 7 !== buf.length)
    return false;
  return true;
}
function isChunkMinimalPushHelper(chunk) {
  const data = chunk.data;
  const op = chunk.op;
  if (!Array.isArray(data))
    return true;
  if (data.length === 0)
    return op === OP_default.OP_0;
  if (data.length === 1 && data[0] >= 1 && data[0] <= 16)
    return op === OP_default.OP_1 + (data[0] - 1);
  if (data.length === 1 && data[0] === 129)
    return op === OP_default.OP_1NEGATE;
  if (data.length <= 75)
    return op === data.length;
  if (data.length <= 255)
    return op === OP_default.OP_PUSHDATA1;
  if (data.length <= 65535)
    return op === OP_default.OP_PUSHDATA2;
  return true;
}
var Spend = class {
  sourceTXID;
  sourceOutputIndex;
  sourceSatoshis;
  lockingScript;
  transactionVersion;
  otherInputs;
  outputs;
  inputIndex;
  unlockingScript;
  inputSequence;
  lockTime;
  context;
  programCounter;
  lastCodeSeparator;
  stack;
  altStack;
  ifStack;
  elseStack;
  memoryLimit;
  stackMem;
  altStackMem;
  isRelaxedOverride;
  verifyFlags;
  executedOpCount;
  returningFromConditional;
  sigHashCache;
  /**
   * @constructor
   * Constructs the Spend object with necessary transaction details.
   * @param {string} params.sourceTXID - The transaction ID of the source UTXO.
   * @param {number} params.sourceOutputIndex - The index of the output in the source transaction.
   * @param {BigNumber} params.sourceSatoshis - The amount of satoshis in the source UTXO.
   * @param {LockingScript} params.lockingScript - The locking script associated with the UTXO.
   * @param {number} params.transactionVersion - The version of the current transaction.
   * @param {Array<{ sourceTXID: string, sourceOutputIndex: number, sequence: number }>} params.otherInputs -
   *        An array of other inputs in the transaction.
   * @param {Array<{ satoshis: BigNumber, lockingScript: LockingScript }>} params.outputs -
   *        The outputs of the current transaction.
   * @param {number} params.inputIndex - The index of this input in the current transaction.
   * @param {UnlockingScript} params.unlockingScript - The unlocking script for this spend.
   * @param {number} params.inputSequence - The sequence number of this input.
   * @param {number} params.lockTime - The lock time of the transaction.
   * @param {number} params.memoryLimit - Optional control over script interpreter memory usage.
   * @param {boolean} params.isRelaxed - Optional. If true, disables all the unlocking script maleability restrictions consitent with Chronicle release. Maleability restrictions are neve appliced to locking scripts.
   *
   * @example
   * const spend = new Spend({
   *   sourceTXID: "abcd1234", // sourceTXID
   *   sourceOutputIndex: 0, // sourceOutputIndex
   *   sourceSatoshis: new BigNumber(1000), // sourceSatoshis
   *   lockingScript: LockingScript.fromASM("OP_DUP OP_HASH160 abcd1234... OP_EQUALVERIFY OP_CHECKSIG"),
   *   transactionVersion: 1, // transactionVersion
   *   otherInputs: [{ sourceTXID: "abcd1234", sourceOutputIndex: 1, sequence: 0xffffffff }], // otherInputs
   *   outputs: [{ satoshis: new BigNumber(500), lockingScript: LockingScript.fromASM("OP_DUP...") }], // outputs
   *   inputIndex: 0, // inputIndex
   *   unlockingScript: UnlockingScript.fromASM("3045... 02ab..."),
   *   inputSequence: 0xffffffff // inputSequence
   *   memoryLimit: 100000 // memoryLimit
   * });
   */
  constructor(params) {
    this.sourceTXID = params.sourceTXID;
    this.sourceOutputIndex = params.sourceOutputIndex;
    this.sourceSatoshis = params.sourceSatoshis;
    this.lockingScript = params.lockingScript;
    this.transactionVersion = params.transactionVersion;
    this.otherInputs = params.otherInputs;
    this.outputs = params.outputs;
    this.inputIndex = params.inputIndex;
    this.unlockingScript = params.unlockingScript;
    this.inputSequence = params.inputSequence;
    this.lockTime = params.lockTime;
    this.memoryLimit = params.memoryLimit ?? 32e6;
    this.isRelaxedOverride = params.isRelaxed === true;
    if (params.verifyFlags === void 0) {
      this.verifyFlags = void 0;
    } else {
      const flagArr = Array.isArray(params.verifyFlags) ? params.verifyFlags : params.verifyFlags.split(",");
      this.verifyFlags = new Set(flagArr.map((flag) => flag.trim()).filter((flag) => flag.length > 0));
    }
    this.stack = [];
    this.altStack = [];
    this.ifStack = [];
    this.elseStack = [];
    this.stackMem = 0;
    this.altStackMem = 0;
    this.executedOpCount = 0;
    this.returningFromConditional = false;
    this.sigHashCache = { hashOutputsSingle: /* @__PURE__ */ new Map() };
    this.reset();
  }
  isRelaxed() {
    return this.isRelaxedOverride || this.transactionVersion > 1;
  }
  hasExplicitFlags() {
    return this.verifyFlags !== void 0;
  }
  hasFlag(flag) {
    return this.verifyFlags?.has(flag) === true;
  }
  isAfterGenesis() {
    if (this.hasExplicitFlags()) {
      return this.hasFlag("GENESIS") || this.hasFlag("UTXO_AFTER_GENESIS") || this.hasFlag("UTXO_AFTER_CHRONICLE");
    }
    return this.isRelaxed();
  }
  isAfterChronicle() {
    if (this.hasExplicitFlags())
      return this.hasFlag("UTXO_AFTER_CHRONICLE");
    return this.isRelaxed();
  }
  shouldEnforceMinimalData() {
    if (this.hasExplicitFlags())
      return this.hasFlag("MINIMALDATA");
    return !this.isRelaxed();
  }
  shouldEnforceLowS() {
    if (this.hasExplicitFlags())
      return this.hasFlag("LOW_S");
    return !this.isRelaxed();
  }
  shouldEnforceNullDummy() {
    if (this.hasExplicitFlags())
      return this.hasFlag("NULLDUMMY");
    return !this.isRelaxed();
  }
  shouldEnforceSigPushOnly() {
    if (this.hasExplicitFlags())
      return this.hasFlag("SIGPUSHONLY");
    return !this.isRelaxed();
  }
  shouldEnforceCleanStack() {
    if (this.hasExplicitFlags())
      return this.hasFlag("CLEANSTACK");
    return !this.isRelaxed();
  }
  shouldEnforceDerSignatures() {
    if (this.hasExplicitFlags()) {
      return this.hasFlag("DERSIG") || this.hasFlag("STRICTENC") || this.hasFlag("LOW_S") || this.hasFlag("SIGHASH_FORKID");
    }
    return true;
  }
  shouldEnforceStrictEncoding() {
    if (this.hasExplicitFlags()) {
      return this.hasFlag("STRICTENC") || this.hasFlag("SIGHASH_FORKID");
    }
    return true;
  }
  scriptNumMaxSize() {
    if (this.hasExplicitFlags() && !this.isAfterGenesis())
      return 4;
    return void 0;
  }
  maxPushSize() {
    if (this.hasExplicitFlags() && !this.isAfterGenesis())
      return maxScriptElementSizeBeforeGenesis;
    return maxScriptElementSize;
  }
  reset() {
    this.context = "UnlockingScript";
    this.programCounter = 0;
    this.lastCodeSeparator = null;
    this.stack = [];
    this.altStack = [];
    this.ifStack = [];
    this.elseStack = [];
    this.stackMem = 0;
    this.altStackMem = 0;
    this.executedOpCount = 0;
    this.returningFromConditional = false;
    this.sigHashCache = { hashOutputsSingle: /* @__PURE__ */ new Map() };
  }
  ensureStackMem(additional) {
    if (this.stackMem + additional > this.memoryLimit) {
      this.scriptEvaluationError("Stack memory usage has exceeded " + String(this.memoryLimit) + " bytes");
    }
  }
  ensureAltStackMem(additional) {
    if (this.altStackMem + additional > this.memoryLimit) {
      this.scriptEvaluationError("Alt stack memory usage has exceeded " + String(this.memoryLimit) + " bytes");
    }
  }
  pushStack(item) {
    this.ensureStackMem(item.length);
    this.stack.push(item);
    this.stackMem += item.length;
  }
  pushStackCopy(item) {
    this.ensureStackMem(item.length);
    const copy = item.slice();
    this.stack.push(copy);
    this.stackMem += copy.length;
  }
  popStack() {
    if (this.stack.length === 0) {
      this.scriptEvaluationError("Attempted to pop from an empty stack.");
    }
    const item = this.stack.pop();
    if (item === void 0) {
      this.scriptEvaluationError("Attempted to pop from an empty stack.");
      return [];
    }
    this.stackMem -= item.length;
    return item;
  }
  stackTop(index = -1) {
    if (this.stack.length === 0 || this.stack.length < Math.abs(index) || index >= 0 && index >= this.stack.length) {
      this.scriptEvaluationError(`Stack underflow accessing element at index ${index}. Stack length is ${this.stack.length}.`);
    }
    return this.stack[this.stack.length + index];
  }
  setStack(items) {
    this.stack = items.map((item) => item.slice());
    this.stackMem = this.stack.reduce((total, item) => total + item.length, 0);
  }
  clearAltStack() {
    this.altStack = [];
    this.altStackMem = 0;
  }
  pushAltStack(item) {
    this.ensureAltStackMem(item.length);
    this.altStack.push(item);
    this.altStackMem += item.length;
  }
  popAltStack() {
    if (this.altStack.length === 0) {
      this.scriptEvaluationError("Attempted to pop from an empty alt stack.");
    }
    const item = this.altStack.pop();
    if (item === void 0) {
      this.scriptEvaluationError("Attempted to pop from an empty alt stack.");
      return [];
    }
    this.altStackMem -= item.length;
    return item;
  }
  readScriptNumber(buf) {
    try {
      return BigNumber.fromScriptNum(buf, this.shouldEnforceMinimalData(), this.scriptNumMaxSize());
    } catch (e2) {
      const message = e2 instanceof Error ? e2.message : String(e2);
      this.scriptEvaluationError(message);
    }
    return new BigNumber(0);
  }
  isDefinedHashType(scope) {
    const baseType = scope & 31;
    return baseType >= TransactionSignature.SIGHASH_ALL && baseType <= TransactionSignature.SIGHASH_SINGLE;
  }
  checkSignatureEncoding(buf) {
    if (buf.length === 0)
      return true;
    const enforceDer = this.shouldEnforceDerSignatures();
    if (enforceDer && !isChecksigFormatHelper(buf)) {
      this.scriptEvaluationError("The signature format is invalid.");
      return false;
    }
    try {
      const sig = TransactionSignature.fromChecksigFormat(buf);
      if (this.shouldEnforceStrictEncoding() && !this.isDefinedHashType(sig.scope)) {
        this.scriptEvaluationError("The signature hash type is invalid.");
        return false;
      }
      if (this.shouldEnforceStrictEncoding() && (sig.scope & TransactionSignature.SIGHASH_CHRONICLE) !== 0 && !this.isAfterChronicle()) {
        this.scriptEvaluationError("The signature hash type is invalid before Chronicle.");
        return false;
      }
      const hasForkId = (sig.scope & TransactionSignature.SIGHASH_FORKID) !== 0;
      if (this.hasExplicitFlags()) {
        if (this.hasFlag("SIGHASH_FORKID") && !hasForkId) {
          this.scriptEvaluationError("The signature must use SIGHASH_FORKID.");
          return false;
        }
        if (!this.hasFlag("SIGHASH_FORKID") && !this.isAfterGenesis() && hasForkId) {
          this.scriptEvaluationError("The signature must not use SIGHASH_FORKID.");
          return false;
        }
      }
      if (this.shouldEnforceLowS() && !sig.hasLowS()) {
        this.scriptEvaluationError("The signature must have a low S value.");
        return false;
      }
    } catch {
      if (enforceDer) {
        this.scriptEvaluationError("The signature format is invalid.");
        return false;
      }
    }
    return true;
  }
  parseChecksigSignature(buf) {
    try {
      return TransactionSignature.fromChecksigFormat(buf);
    } catch (e2) {
      if (this.shouldEnforceDerSignatures())
        throw e2;
      return this.parseLaxChecksigSignature(buf);
    }
  }
  readLaxDERLength(buf, position) {
    const first = buf[position.value++];
    if (first === void 0)
      throw new Error("Invalid DER length");
    if ((first & 128) === 0)
      return first;
    const lengthBytes = first & 127;
    if (lengthBytes === 0 || position.value + lengthBytes > buf.length) {
      throw new Error("Invalid DER length");
    }
    let length = 0;
    for (let i = 0; i < lengthBytes; i++) {
      length = length << 8 | (buf[position.value++] ?? 0);
    }
    return length;
  }
  parseLaxDERInteger(buf, position, sequenceEnd) {
    if (position.value >= sequenceEnd || buf[position.value++] !== 2) {
      throw new Error("Invalid DER integer");
    }
    const length = this.readLaxDERLength(buf, position);
    if (position.value + length > sequenceEnd) {
      throw new Error("Invalid DER integer length");
    }
    let bytes2 = buf.slice(position.value, position.value + length);
    position.value += length;
    while (bytes2.length > 1 && bytes2[0] === 0)
      bytes2 = bytes2.slice(1);
    if (bytes2.length === 0)
      bytes2 = [0];
    return new BigNumber(bytes2);
  }
  parseLaxChecksigSignature(buf) {
    if (buf.length === 0)
      return TransactionSignature.fromChecksigFormat(buf);
    const scope = buf.at(-1);
    const der = buf.slice(0, -1);
    const position = { value: 0 };
    if (der[position.value++] !== 48)
      throw new Error("Signature DER must start with 0x30");
    const sequenceLength = this.readLaxDERLength(der, position);
    const sequenceEnd = Math.min(position.value + sequenceLength, der.length);
    const r3 = this.parseLaxDERInteger(der, position, sequenceEnd);
    const s4 = this.parseLaxDERInteger(der, position, sequenceEnd);
    return new TransactionSignature(r3, s4, scope);
  }
  checkPublicKeyEncoding(buf) {
    if (!this.shouldEnforceStrictEncoding())
      return true;
    if (buf.length === 0) {
      this.scriptEvaluationError("Public key is empty.");
      return false;
    }
    if (buf.length < 33) {
      this.scriptEvaluationError("The public key is too short, it must be at least 33 bytes.");
      return false;
    }
    if (buf[0] === 4) {
      if (buf.length !== 65) {
        this.scriptEvaluationError("The non-compressed public key must be 65 bytes.");
        return false;
      }
    } else if (buf[0] === 2 || buf[0] === 3) {
      if (buf.length !== 33) {
        this.scriptEvaluationError("The compressed public key must be 33 bytes.");
        return false;
      }
    } else {
      this.scriptEvaluationError("The public key is in an unknown format.");
      return false;
    }
    try {
      PublicKey.fromDER(buf);
    } catch {
      this.scriptEvaluationError("The public key is in an unknown format.");
      return false;
    }
    return true;
  }
  verifySignature(sig, pubkey, subscript) {
    const params = {
      sourceTXID: this.sourceTXID,
      sourceOutputIndex: this.sourceOutputIndex,
      sourceSatoshis: this.sourceSatoshis,
      transactionVersion: this.transactionVersion,
      otherInputs: this.otherInputs,
      outputs: this.outputs,
      inputIndex: this.inputIndex,
      subscript,
      inputSequence: this.inputSequence,
      lockTime: this.lockTime,
      scope: sig.scope,
      cache: this.sigHashCache
    };
    const hash = TransactionSignature.usesOtdaSingleBug(params) ? new BigNumber([1, ...new Array(31).fill(0)]) : new BigNumber(hash256(TransactionSignature.formatBytes(params)));
    return verify(hash, sig, pubkey);
  }
  step() {
    if (this.stackMem > this.memoryLimit) {
      this.scriptEvaluationError("Stack memory usage has exceeded " + String(this.memoryLimit) + " bytes");
      return false;
    }
    if (this.altStackMem > this.memoryLimit) {
      this.scriptEvaluationError("Alt stack memory usage has exceeded " + String(this.memoryLimit) + " bytes");
      return false;
    }
    if (this.context === "UnlockingScript" && this.programCounter >= this.unlockingScript.chunks.length) {
      if (this.ifStack.length > 0) {
        this.scriptEvaluationError("Every OP_IF, OP_NOTIF, or OP_ELSE must be terminated with OP_ENDIF prior to the end of the unlocking script.");
      }
      this.clearAltStack();
      this.ifStack = [];
      this.elseStack = [];
      this.returningFromConditional = false;
      this.lastCodeSeparator = null;
      this.context = "LockingScript";
      this.programCounter = 0;
    }
    const currentScript = this.context === "UnlockingScript" ? this.unlockingScript : this.lockingScript;
    if (this.programCounter >= currentScript.chunks.length) {
      return false;
    }
    const operation = currentScript.chunks[this.programCounter];
    const currentOpcode = operation.op;
    if (currentOpcode === void 0) {
      this.scriptEvaluationError(`Missing opcode in ${this.context} at pc=${this.programCounter}.`);
    }
    if (operation.invalidLength === true) {
      this.scriptEvaluationError(`Malformed push data in ${this.context} at pc=${this.programCounter}.`);
    }
    if (Array.isArray(operation.data) && operation.data.length > this.maxPushSize()) {
      this.scriptEvaluationError(`Data push > ${this.maxPushSize()} bytes (pc=${this.programCounter}).`);
    }
    const isScriptExecuting = !this.returningFromConditional && !this.ifStack.includes(false);
    if (this.hasExplicitFlags() && !this.isAfterGenesis() && !this.isAfterChronicle() && (currentOpcode === OP_default.OP_2MUL || currentOpcode === OP_default.OP_2DIV || currentOpcode === OP_default.OP_VERIF || currentOpcode === OP_default.OP_VERNOTIF)) {
      this.scriptEvaluationError(`${OP_default[currentOpcode]} is disabled until Chronicle.`);
    }
    if (isScriptExecuting && currentOpcode >= 0 && currentOpcode <= OP_default.OP_PUSHDATA4) {
      if (this.shouldEnforceMinimalData() && !isChunkMinimalPushHelper(operation)) {
        this.scriptEvaluationError(`This data is not minimally-encoded. (PC: ${this.programCounter})`);
      }
      this.pushStack(Array.isArray(operation.data) ? operation.data : []);
    } else if (isScriptExecuting || currentOpcode >= OP_default.OP_IF && currentOpcode <= OP_default.OP_ENDIF) {
      let buf, buf1, buf2, buf3;
      let x1, x22, x32;
      let bn, bn1, bn2, bn3;
      let n2, size, fValue, fSuccess, subscript;
      let bufSig, bufPubkey;
      let sig, pubkey;
      let i, ikey, isig, nKeysCount, nSigsCount, fOk;
      if (isScriptExecuting && currentOpcode > OP_default.OP_16) {
        this.executedOpCount++;
        if (this.hasExplicitFlags() && !this.isAfterGenesis() && this.executedOpCount > maxOpsBeforeGenesis) {
          this.scriptEvaluationError(`Script executed more than ${maxOpsBeforeGenesis} opcodes.`);
        }
      }
      if (this.hasExplicitFlags() && !this.isAfterChronicle()) {
        if (isScriptExecuting && (currentOpcode === OP_default.OP_SUBSTR || currentOpcode === OP_default.OP_LEFT || currentOpcode === OP_default.OP_RIGHT || currentOpcode === OP_default.OP_LSHIFTNUM || currentOpcode === OP_default.OP_RSHIFTNUM)) {
          if (this.hasFlag("DISCOURAGE_UPGRADABLE_NOPS")) {
            this.scriptEvaluationError(`${OP_default[currentOpcode]} is discouraged by verification flags.`);
          }
          this.programCounter++;
          return true;
        }
        if ((isScriptExecuting || !this.isAfterGenesis()) && (currentOpcode === OP_default.OP_2MUL || currentOpcode === OP_default.OP_2DIV)) {
          this.scriptEvaluationError(`${OP_default[currentOpcode]} is disabled until Chronicle.`);
        }
        if ((isScriptExecuting || !this.isAfterGenesis()) && (currentOpcode === OP_default.OP_VER || currentOpcode === OP_default.OP_VERIF || currentOpcode === OP_default.OP_VERNOTIF)) {
          this.scriptEvaluationError(`${OP_default[currentOpcode]} is disabled until Chronicle.`);
        }
        if (!isScriptExecuting && this.isAfterGenesis() && (currentOpcode === OP_default.OP_VERIF || currentOpcode === OP_default.OP_VERNOTIF)) {
          this.programCounter++;
          return true;
        }
      }
      if (isScriptExecuting && this.hasFlag("DISCOURAGE_UPGRADABLE_NOPS") && (currentOpcode === OP_default.OP_NOP1 || currentOpcode === OP_default.OP_CHECKLOCKTIMEVERIFY || currentOpcode === OP_default.OP_CHECKSEQUENCEVERIFY || currentOpcode === OP_default.OP_NOP9 || currentOpcode === OP_default.OP_NOP10)) {
        this.scriptEvaluationError(`${OP_default[currentOpcode]} is discouraged by verification flags.`);
      }
      switch (currentOpcode) {
        case OP_default.OP_VER: {
          const ver = this.transactionVersion;
          this.pushStack([ver & 255, ver >>> 8 & 255, ver >>> 16 & 255, ver >>> 24 & 255]);
          break;
        }
        case OP_default.OP_SUBSTR: {
          if (this.stack.length < 3)
            this.scriptEvaluationError("OP_SUBSTR requires at least three items to be on the stack.");
          const len = this.readScriptNumber(this.popStack()).toNumber();
          const offset = this.readScriptNumber(this.popStack()).toNumber();
          buf = this.popStack();
          const size2 = buf.length;
          if (offset < 0 || offset >= size2 || len < 0 || len > size2 - offset) {
            this.scriptEvaluationError(`OP_SUBSTR offset (${offset}) must be in range [0, ${size2}) and length (${len}) must be in range [0, ${size2 - offset}]`);
          }
          this.pushStack(buf.slice(offset, offset + len));
          break;
        }
        case OP_default.OP_LEFT: {
          if (this.stack.length < 2)
            this.scriptEvaluationError("OP_LEFT requires at least two items to be on the stack.");
          const len = this.readScriptNumber(this.popStack()).toNumber();
          buf = this.popStack();
          const size2 = buf.length;
          if (len < 0 || len > size2) {
            this.scriptEvaluationError(`OP_LEFT length (${len}) must be in range [0, ${size2}]`);
          }
          this.pushStack(buf.slice(0, len));
          break;
        }
        case OP_default.OP_RIGHT: {
          if (this.stack.length < 2)
            this.scriptEvaluationError("OP_RIGHT requires at least two items to be on the stack.");
          const len = this.readScriptNumber(this.popStack()).toNumber();
          buf = this.popStack();
          const size2 = buf.length;
          if (len < 0 || len > size2) {
            this.scriptEvaluationError(`OP_RIGHT length (${len}) must be in range [0, ${size2}]`);
          }
          this.pushStack(buf.slice(size2 - len));
          break;
        }
        case OP_default.OP_LSHIFTNUM: {
          if (this.stack.length < 2)
            this.scriptEvaluationError("OP_LSHIFTNUM requires at least two items to be on the stack.");
          const bits = this.readScriptNumber(this.popStack()).toBigInt();
          if (bits < 0) {
            this.scriptEvaluationError("OP_LSHIFTNUM bits to shift must not be negative.");
          }
          const value = this.readScriptNumber(this.popStack()).toBigInt();
          const resultBn = new BigNumber(value << bits);
          this.pushStack(resultBn.toScriptNum());
          break;
        }
        case OP_default.OP_RSHIFTNUM: {
          if (this.stack.length < 2)
            this.scriptEvaluationError("OP_RSHIFTNUM requires at least two items to be on the stack.");
          const bits = this.readScriptNumber(this.popStack()).toBigInt();
          if (bits < 0) {
            this.scriptEvaluationError("OP_RSHIFTNUM bits to shift must not be negative.");
          }
          const value = this.readScriptNumber(this.popStack()).toBigInt();
          let resultBn;
          if (value < 0) {
            resultBn = new BigNumber(-(-value >> bits));
          } else {
            resultBn = new BigNumber(value >> bits);
          }
          this.pushStack(resultBn.toScriptNum());
          break;
        }
        case OP_default.OP_1NEGATE:
          this.pushStackCopy(SCRIPTNUM_NEG_1);
          break;
        case OP_default.OP_0:
          this.pushStackCopy(SCRIPTNUMS_0_TO_16[0]);
          break;
        case OP_default.OP_1:
        case OP_default.OP_2:
        case OP_default.OP_3:
        case OP_default.OP_4:
        case OP_default.OP_5:
        case OP_default.OP_6:
        case OP_default.OP_7:
        case OP_default.OP_8:
        case OP_default.OP_9:
        case OP_default.OP_10:
        case OP_default.OP_11:
        case OP_default.OP_12:
        case OP_default.OP_13:
        case OP_default.OP_14:
        case OP_default.OP_15:
        case OP_default.OP_16:
          n2 = currentOpcode - (OP_default.OP_1 - 1);
          this.pushStackCopy(SCRIPTNUMS_0_TO_16[n2]);
          break;
        case OP_default.OP_NOP:
        // OP_NOP1 (0xb0), OP_NOP9 (0xb8), OP_NOP10 (0xb9) are the only defined upgrade-NOP slots
        // in node v1.2.0. All other values above 0xb9 are FIRST_UNDEFINED_OP_VALUE and invalid.
        // falls through
        case OP_default.OP_NOP1:
        // OP_NOP2 (0xb1) = OP_CHECKLOCKTIMEVERIFY: on BSV post-genesis treated as NOP
        // falls through
        case OP_default.OP_CHECKLOCKTIMEVERIFY:
          break;
        // OP_NOP3 (0xb2) = OP_CHECKSEQUENCEVERIFY: on BSV post-genesis treated as NOP
        case OP_default.OP_CHECKSEQUENCEVERIFY:
          if (this.hasFlag("CHECKSEQUENCEVERIFY")) {
            if (this.stack.length < 1)
              this.scriptEvaluationError("OP_CHECKSEQUENCEVERIFY requires at least one item to be on the stack.");
            let sequenceLock = 0n;
            try {
              sequenceLock = BigNumber.fromScriptNum(this.stackTop(), this.shouldEnforceMinimalData(), 5).toBigInt();
            } catch {
              this.scriptEvaluationError("OP_CHECKSEQUENCEVERIFY requires a minimally-encoded numeric lock time.");
            }
            if (sequenceLock < 0n)
              this.scriptEvaluationError("OP_CHECKSEQUENCEVERIFY requires a non-negative lock time.");
            if (Number(sequenceLock & BigInt(sequenceLocktimeDisableFlag)) === 0 && this.transactionVersion < 2) {
              this.scriptEvaluationError("OP_CHECKSEQUENCEVERIFY lock time is unsatisfied.");
            }
          }
          break;
        case OP_default.OP_NOP9:
        case OP_default.OP_NOP10:
          break;
        case OP_default.OP_VERIF:
        case OP_default.OP_VERNOTIF:
          fValue = false;
          if (isScriptExecuting) {
            if (this.stack.length < 1)
              this.scriptEvaluationError("OP_VERIF and OP_VERNOTIF require at least one item on the stack when they are used!");
            buf1 = this.popStack();
            if (buf1.length === 4) {
              const ver = this.transactionVersion;
              buf2 = [ver & 255, ver >>> 8 & 255, ver >>> 16 & 255, ver >>> 24 & 255];
              fValue = compareNumberArrays(buf1, buf2);
            }
            if (currentOpcode === OP_default.OP_VERNOTIF)
              fValue = !fValue;
          }
          this.ifStack.push(fValue);
          this.elseStack.push(false);
          break;
        case OP_default.OP_IF:
        case OP_default.OP_NOTIF:
          fValue = false;
          if (isScriptExecuting) {
            if (this.stack.length < 1)
              this.scriptEvaluationError("OP_IF and OP_NOTIF require at least one item on the stack when they are used!");
            buf = this.popStack();
            if (this.hasFlag("MINIMALIF") && buf.length > 0 && !(buf.length === 1 && buf[0] === 1)) {
              this.scriptEvaluationError("OP_IF and OP_NOTIF require minimal truth values.");
            }
            fValue = this.castToBool(buf);
            if (currentOpcode === OP_default.OP_NOTIF)
              fValue = !fValue;
          }
          this.ifStack.push(fValue);
          this.elseStack.push(false);
          break;
        case OP_default.OP_ELSE:
          if (this.ifStack.length === 0)
            this.scriptEvaluationError("OP_ELSE requires a preceeding OP_IF.");
          if (this.hasExplicitFlags() && this.isAfterGenesis() && this.elseStack.at(-1)) {
            this.scriptEvaluationError("OP_ELSE may only be used once for each OP_IF or OP_NOTIF after Genesis.");
          }
          this.elseStack[this.elseStack.length - 1] = true;
          this.ifStack[this.ifStack.length - 1] = !this.ifStack.at(-1);
          break;
        case OP_default.OP_ENDIF:
          if (this.ifStack.length === 0)
            this.scriptEvaluationError("OP_ENDIF requires a preceeding OP_IF.");
          this.ifStack.pop();
          this.elseStack.pop();
          break;
        case OP_default.OP_VERIFY:
          if (this.stack.length < 1)
            this.scriptEvaluationError("OP_VERIFY requires at least one item to be on the stack.");
          buf1 = this.stackTop();
          fValue = this.castToBool(buf1);
          if (!fValue)
            this.scriptEvaluationError("OP_VERIFY requires the top stack value to be truthy.");
          this.popStack();
          break;
        case OP_default.OP_RETURN:
          if (this.hasExplicitFlags() && !this.isAfterGenesis()) {
            this.scriptEvaluationError("OP_RETURN is invalid before Genesis.");
          }
          if (this.ifStack.length > 0) {
            this.returningFromConditional = true;
          } else {
            if (this.context === "UnlockingScript")
              this.programCounter = this.unlockingScript.chunks.length;
            else
              this.programCounter = this.lockingScript.chunks.length;
            this.programCounter--;
          }
          break;
        case OP_default.OP_TOALTSTACK:
          if (this.stack.length < 1)
            this.scriptEvaluationError("OP_TOALTSTACK requires at oeast one item to be on the stack.");
          this.pushAltStack(this.popStack());
          break;
        case OP_default.OP_FROMALTSTACK:
          if (this.altStack.length < 1)
            this.scriptEvaluationError("OP_FROMALTSTACK requires at least one item to be on the stack.");
          this.pushStack(this.popAltStack());
          break;
        case OP_default.OP_2DROP:
          if (this.stack.length < 2)
            this.scriptEvaluationError("OP_2DROP requires at least two items to be on the stack.");
          this.popStack();
          this.popStack();
          break;
        case OP_default.OP_2DUP:
          if (this.stack.length < 2)
            this.scriptEvaluationError("OP_2DUP requires at least two items to be on the stack.");
          buf1 = this.stackTop(-2);
          buf2 = this.stackTop(-1);
          this.pushStackCopy(buf1);
          this.pushStackCopy(buf2);
          break;
        case OP_default.OP_3DUP:
          if (this.stack.length < 3)
            this.scriptEvaluationError("OP_3DUP requires at least three items to be on the stack.");
          buf1 = this.stackTop(-3);
          buf2 = this.stackTop(-2);
          buf3 = this.stackTop(-1);
          this.pushStackCopy(buf1);
          this.pushStackCopy(buf2);
          this.pushStackCopy(buf3);
          break;
        case OP_default.OP_2OVER:
          if (this.stack.length < 4)
            this.scriptEvaluationError("OP_2OVER requires at least four items to be on the stack.");
          buf1 = this.stackTop(-4);
          buf2 = this.stackTop(-3);
          this.pushStackCopy(buf1);
          this.pushStackCopy(buf2);
          break;
        case OP_default.OP_2ROT: {
          if (this.stack.length < 6)
            this.scriptEvaluationError("OP_2ROT requires at least six items to be on the stack.");
          const rot6 = this.popStack();
          const rot5 = this.popStack();
          const rot4 = this.popStack();
          const rot3 = this.popStack();
          const rot2 = this.popStack();
          const rot1 = this.popStack();
          this.pushStack(rot3);
          this.pushStack(rot4);
          this.pushStack(rot5);
          this.pushStack(rot6);
          this.pushStack(rot1);
          this.pushStack(rot2);
          break;
        }
        case OP_default.OP_2SWAP: {
          if (this.stack.length < 4)
            this.scriptEvaluationError("OP_2SWAP requires at least four items to be on the stack.");
          const swap4 = this.popStack();
          const swap3 = this.popStack();
          const swap2 = this.popStack();
          const swap1 = this.popStack();
          this.pushStack(swap3);
          this.pushStack(swap4);
          this.pushStack(swap1);
          this.pushStack(swap2);
          break;
        }
        case OP_default.OP_IFDUP:
          if (this.stack.length < 1)
            this.scriptEvaluationError("OP_IFDUP requires at least one item to be on the stack.");
          buf1 = this.stackTop();
          if (this.castToBool(buf1)) {
            this.pushStackCopy(buf1);
          }
          break;
        case OP_default.OP_DEPTH:
          this.pushStack(new BigNumber(this.stack.length).toScriptNum());
          break;
        case OP_default.OP_DROP:
          if (this.stack.length < 1)
            this.scriptEvaluationError("OP_DROP requires at least one item to be on the stack.");
          this.popStack();
          break;
        case OP_default.OP_DUP:
          if (this.stack.length < 1)
            this.scriptEvaluationError("OP_DUP requires at least one item to be on the stack.");
          this.pushStackCopy(this.stackTop());
          break;
        case OP_default.OP_NIP:
          if (this.stack.length < 2)
            this.scriptEvaluationError("OP_NIP requires at least two items to be on the stack.");
          buf2 = this.popStack();
          this.popStack();
          this.pushStack(buf2);
          break;
        case OP_default.OP_OVER:
          if (this.stack.length < 2)
            this.scriptEvaluationError("OP_OVER requires at least two items to be on the stack.");
          this.pushStackCopy(this.stackTop(-2));
          break;
        case OP_default.OP_PICK:
        case OP_default.OP_ROLL: {
          if (this.stack.length < 2)
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires at least two items to be on the stack.`);
          bn = this.readScriptNumber(this.popStack());
          const nBigInt = bn.toBigInt();
          if (nBigInt < 0n || nBigInt >= BigInt(this.stack.length)) {
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires the top stack element to be 0 or a positive number less than the current size of the stack.`);
          }
          const nIndex = Number(nBigInt);
          const itemToMoveOrCopy = this.stack[this.stack.length - 1 - nIndex];
          if (currentOpcode === OP_default.OP_ROLL) {
            this.stack.splice(this.stack.length - 1 - nIndex, 1);
            this.stackMem -= itemToMoveOrCopy.length;
            this.pushStack(itemToMoveOrCopy);
          } else {
            this.pushStackCopy(itemToMoveOrCopy);
          }
          break;
        }
        case OP_default.OP_ROT:
          if (this.stack.length < 3)
            this.scriptEvaluationError("OP_ROT requires at least three items to be on the stack.");
          x32 = this.popStack();
          x22 = this.popStack();
          x1 = this.popStack();
          this.pushStack(x22);
          this.pushStack(x32);
          this.pushStack(x1);
          break;
        case OP_default.OP_SWAP:
          if (this.stack.length < 2)
            this.scriptEvaluationError("OP_SWAP requires at least two items to be on the stack.");
          x22 = this.popStack();
          x1 = this.popStack();
          this.pushStack(x22);
          this.pushStack(x1);
          break;
        case OP_default.OP_TUCK:
          if (this.stack.length < 2)
            this.scriptEvaluationError("OP_TUCK requires at least two items to be on the stack.");
          buf1 = this.stackTop(-1);
          this.ensureStackMem(buf1.length);
          this.stack.splice(-2, 0, buf1.slice());
          this.stackMem += buf1.length;
          break;
        case OP_default.OP_SIZE:
          if (this.stack.length < 1)
            this.scriptEvaluationError("OP_SIZE requires at least one item to be on the stack.");
          this.pushStack(new BigNumber(this.stackTop().length).toScriptNum());
          break;
        case OP_default.OP_AND:
        case OP_default.OP_OR:
        case OP_default.OP_XOR: {
          if (this.stack.length < 2)
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires at least two items on the stack.`);
          buf2 = this.popStack();
          buf1 = this.popStack();
          if (buf1.length !== buf2.length)
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires the top two stack items to be the same size.`);
          const resultBufBitwiseOp = new Array(buf1.length);
          for (let k4 = 0; k4 < buf1.length; k4++) {
            if (currentOpcode === OP_default.OP_AND)
              resultBufBitwiseOp[k4] = buf1[k4] & buf2[k4];
            else if (currentOpcode === OP_default.OP_OR)
              resultBufBitwiseOp[k4] = buf1[k4] | buf2[k4];
            else
              resultBufBitwiseOp[k4] = buf1[k4] ^ buf2[k4];
          }
          this.pushStack(resultBufBitwiseOp);
          break;
        }
        case OP_default.OP_INVERT: {
          if (this.stack.length < 1)
            this.scriptEvaluationError("OP_INVERT requires at least one item to be on the stack.");
          buf = this.popStack();
          const invertedBufOp = new Array(buf.length);
          for (let k4 = 0; k4 < buf.length; k4++) {
            invertedBufOp[k4] = ~buf[k4] & 255;
          }
          this.pushStack(invertedBufOp);
          break;
        }
        case OP_default.OP_LSHIFT:
        case OP_default.OP_RSHIFT: {
          if (this.stack.length < 2)
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires at least two items to be on the stack.`);
          bn2 = this.readScriptNumber(this.popStack());
          buf1 = this.popStack();
          const shiftBits = bn2.toBigInt();
          if (shiftBits < 0n)
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires the top item on the stack not to be negative.`);
          if (buf1.length === 0) {
            this.pushStack([]);
            break;
          }
          bn1 = new BigNumber(buf1);
          let shiftedBn;
          if (currentOpcode === OP_default.OP_LSHIFT) {
            shiftedBn = bn1.ushln(shiftBits);
            const mask = new BigNumber(1).ushln(buf1.length * 8).isubn(1);
            shiftedBn = shiftedBn.iand(mask);
          } else {
            shiftedBn = bn1.ushrn(shiftBits);
          }
          const shiftedArr = shiftedBn.toArray("be", buf1.length);
          this.pushStack(shiftedArr);
          break;
        }
        case OP_default.OP_EQUAL:
        case OP_default.OP_EQUALVERIFY:
          if (this.stack.length < 2)
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires at least two items to be on the stack.`);
          buf2 = this.popStack();
          buf1 = this.popStack();
          fValue = compareNumberArrays(buf1, buf2);
          this.pushStack(fValue ? [1] : []);
          if (currentOpcode === OP_default.OP_EQUALVERIFY) {
            if (!fValue)
              this.scriptEvaluationError("OP_EQUALVERIFY requires the top two stack items to be equal.");
            this.popStack();
          }
          break;
        case OP_default.OP_1ADD:
        case OP_default.OP_1SUB:
        case OP_default.OP_2MUL:
        case OP_default.OP_2DIV:
        case OP_default.OP_NEGATE:
        case OP_default.OP_ABS:
        case OP_default.OP_NOT:
        case OP_default.OP_0NOTEQUAL:
          if (this.stack.length < 1)
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires at least one item to be on the stack.`);
          bn = this.readScriptNumber(this.popStack());
          switch (currentOpcode) {
            case OP_default.OP_1ADD:
              bn = bn.add(new BigNumber(1));
              break;
            case OP_default.OP_1SUB:
              bn = bn.sub(new BigNumber(1));
              break;
            case OP_default.OP_2MUL:
              bn = bn.mul(new BigNumber(2));
              break;
            case OP_default.OP_2DIV:
              bn = bn.div(new BigNumber(2));
              break;
            case OP_default.OP_NEGATE:
              bn = bn.neg();
              break;
            case OP_default.OP_ABS:
              if (bn.isNeg())
                bn = bn.neg();
              break;
            case OP_default.OP_NOT:
              bn = new BigNumber(bn.cmpn(0) === 0 ? 1 : 0);
              break;
            case OP_default.OP_0NOTEQUAL:
              bn = new BigNumber(bn.cmpn(0) === 0 ? 0 : 1);
              break;
          }
          this.pushStack(bn.toScriptNum());
          break;
        case OP_default.OP_ADD:
        case OP_default.OP_SUB:
        case OP_default.OP_MUL:
        case OP_default.OP_DIV:
        case OP_default.OP_MOD:
        case OP_default.OP_BOOLAND:
        case OP_default.OP_BOOLOR:
        case OP_default.OP_NUMEQUAL:
        case OP_default.OP_NUMEQUALVERIFY:
        case OP_default.OP_NUMNOTEQUAL:
        case OP_default.OP_LESSTHAN:
        case OP_default.OP_GREATERTHAN:
        case OP_default.OP_LESSTHANOREQUAL:
        case OP_default.OP_GREATERTHANOREQUAL:
        case OP_default.OP_MIN:
        case OP_default.OP_MAX: {
          if (this.stack.length < 2)
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires at least two items to be on the stack.`);
          buf2 = this.popStack();
          buf1 = this.popStack();
          bn2 = this.readScriptNumber(buf2);
          bn1 = this.readScriptNumber(buf1);
          let predictedLen = 0;
          switch (currentOpcode) {
            case OP_default.OP_MUL:
              predictedLen = bn1.byteLength() + bn2.byteLength();
              break;
            case OP_default.OP_ADD:
            case OP_default.OP_SUB:
              predictedLen = Math.max(bn1.byteLength(), bn2.byteLength()) + 1;
              break;
            default:
              predictedLen = Math.max(bn1.byteLength(), bn2.byteLength());
          }
          this.ensureStackMem(predictedLen);
          let resultBnArithmetic = new BigNumber(0);
          switch (currentOpcode) {
            case OP_default.OP_ADD:
              resultBnArithmetic = bn1.add(bn2);
              break;
            case OP_default.OP_SUB:
              resultBnArithmetic = bn1.sub(bn2);
              break;
            case OP_default.OP_MUL:
              resultBnArithmetic = bn1.mul(bn2);
              break;
            case OP_default.OP_DIV:
              if (bn2.cmpn(0) === 0)
                this.scriptEvaluationError("OP_DIV cannot divide by zero!");
              resultBnArithmetic = bn1.div(bn2);
              break;
            case OP_default.OP_MOD:
              if (bn2.cmpn(0) === 0)
                this.scriptEvaluationError("OP_MOD cannot divide by zero!");
              resultBnArithmetic = bn1.mod(bn2);
              break;
            case OP_default.OP_BOOLAND:
              resultBnArithmetic = new BigNumber(bn1.cmpn(0) !== 0 && bn2.cmpn(0) !== 0 ? 1 : 0);
              break;
            case OP_default.OP_BOOLOR:
              resultBnArithmetic = new BigNumber(bn1.cmpn(0) !== 0 || bn2.cmpn(0) !== 0 ? 1 : 0);
              break;
            case OP_default.OP_NUMEQUAL:
              resultBnArithmetic = new BigNumber(bn1.cmp(bn2) === 0 ? 1 : 0);
              break;
            case OP_default.OP_NUMEQUALVERIFY:
              resultBnArithmetic = new BigNumber(bn1.cmp(bn2) === 0 ? 1 : 0);
              break;
            case OP_default.OP_NUMNOTEQUAL:
              resultBnArithmetic = new BigNumber(bn1.cmp(bn2) === 0 ? 0 : 1);
              break;
            case OP_default.OP_LESSTHAN:
              resultBnArithmetic = new BigNumber(bn1.cmp(bn2) < 0 ? 1 : 0);
              break;
            case OP_default.OP_GREATERTHAN:
              resultBnArithmetic = new BigNumber(bn1.cmp(bn2) > 0 ? 1 : 0);
              break;
            case OP_default.OP_LESSTHANOREQUAL:
              resultBnArithmetic = new BigNumber(bn1.cmp(bn2) <= 0 ? 1 : 0);
              break;
            case OP_default.OP_GREATERTHANOREQUAL:
              resultBnArithmetic = new BigNumber(bn1.cmp(bn2) >= 0 ? 1 : 0);
              break;
            case OP_default.OP_MIN:
              resultBnArithmetic = bn1.cmp(bn2) < 0 ? bn1 : bn2;
              break;
            case OP_default.OP_MAX:
              resultBnArithmetic = bn1.cmp(bn2) > 0 ? bn1 : bn2;
              break;
          }
          this.pushStack(resultBnArithmetic.toScriptNum());
          if (currentOpcode === OP_default.OP_NUMEQUALVERIFY) {
            if (!this.castToBool(this.stackTop()))
              this.scriptEvaluationError("OP_NUMEQUALVERIFY requires the top stack item to be truthy.");
            this.popStack();
          }
          break;
        }
        case OP_default.OP_WITHIN:
          if (this.stack.length < 3)
            this.scriptEvaluationError("OP_WITHIN requires at least three items to be on the stack.");
          bn3 = this.readScriptNumber(this.popStack());
          bn2 = this.readScriptNumber(this.popStack());
          bn1 = this.readScriptNumber(this.popStack());
          fValue = bn1.cmp(bn2) >= 0 && bn1.cmp(bn3) < 0;
          this.pushStack(fValue ? [1] : []);
          break;
        case OP_default.OP_RIPEMD160:
        case OP_default.OP_SHA1:
        case OP_default.OP_SHA256:
        case OP_default.OP_HASH160:
        case OP_default.OP_HASH256: {
          if (this.stack.length < 1)
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires at least one item to be on the stack.`);
          buf = this.popStack();
          let hashResult = [];
          if (currentOpcode === OP_default.OP_RIPEMD160)
            hashResult = ripemd160(buf);
          else if (currentOpcode === OP_default.OP_SHA1)
            hashResult = sha1(buf);
          else if (currentOpcode === OP_default.OP_SHA256)
            hashResult = sha256(buf);
          else if (currentOpcode === OP_default.OP_HASH160)
            hashResult = hash160(buf);
          else if (currentOpcode === OP_default.OP_HASH256)
            hashResult = hash256(buf);
          this.pushStack(hashResult);
          break;
        }
        case OP_default.OP_CODESEPARATOR:
          this.lastCodeSeparator = this.programCounter;
          break;
        case OP_default.OP_CHECKSIG:
        case OP_default.OP_CHECKSIGVERIFY: {
          if (this.stack.length < 2)
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires at least two items to be on the stack.`);
          bufPubkey = this.popStack();
          bufSig = this.popStack();
          if (!this.checkSignatureEncoding(bufSig) || !this.checkPublicKeyEncoding(bufPubkey)) {
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires correct encoding for the public key and signature.`);
          }
          fSuccess = false;
          if (bufSig.length > 0) {
            try {
              sig = this.parseChecksigSignature(bufSig);
              const scriptForChecksig = this.context === "UnlockingScript" ? this.unlockingScript : this.lockingScript;
              let scriptCodeChunks = scriptForChecksig.chunks.slice(this.lastCodeSeparator === null ? 0 : this.lastCodeSeparator + 1);
              if (this.context === "UnlockingScript") {
                scriptCodeChunks = scriptCodeChunks.concat(this.lockingScript.chunks);
              }
              subscript = new Script(scriptCodeChunks);
              subscript.findAndDelete(new Script().writeBin(bufSig));
              pubkey = PublicKey.fromDER(bufPubkey);
              fSuccess = this.verifySignature(sig, pubkey, subscript);
            } catch {
              fSuccess = false;
            }
          }
          if (!fSuccess && this.hasFlag("NULLFAIL") && bufSig.length > 0) {
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires failing signatures to be empty.`);
          }
          this.pushStack(fSuccess ? [1] : []);
          if (currentOpcode === OP_default.OP_CHECKSIGVERIFY) {
            if (!fSuccess)
              this.scriptEvaluationError("OP_CHECKSIGVERIFY requires that a valid signature is provided.");
            this.popStack();
          }
          break;
        }
        case OP_default.OP_CHECKMULTISIG:
        case OP_default.OP_CHECKMULTISIGVERIFY: {
          i = 1;
          if (this.stack.length < i) {
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires at least 1 item for nKeys.`);
          }
          const nKeysCountBN = this.readScriptNumber(this.stackTop(-i));
          const nKeysCountBigInt = nKeysCountBN.toBigInt();
          const multisigKeyLimitBigInt = this.hasExplicitFlags() && !this.isAfterGenesis() ? BigInt(maxMultisigKeyCountBeforeGenesis) : maxMultisigKeyCountBigInt;
          if (nKeysCountBigInt < 0n || nKeysCountBigInt > multisigKeyLimitBigInt) {
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires a key count between 0 and ${multisigKeyLimitBigInt.toString()}.`);
          }
          nKeysCount = Number(nKeysCountBigInt);
          const declaredKeyCount = nKeysCount;
          ikey = ++i;
          i += nKeysCount;
          if (this.stack.length < i) {
            this.scriptEvaluationError(`${OP_default[currentOpcode]} stack too small for nKeys and keys. Need ${i}, have ${this.stack.length}.`);
          }
          const nSigsCountBN = this.readScriptNumber(this.stackTop(-i));
          const nSigsCountBigInt = nSigsCountBN.toBigInt();
          if (nSigsCountBigInt < 0n || nSigsCountBigInt > BigInt(nKeysCount)) {
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires the number of signatures to be no greater than the number of keys.`);
          }
          nSigsCount = Number(nSigsCountBigInt);
          const declaredSigCount = nSigsCount;
          isig = ++i;
          i += nSigsCount;
          if (this.stack.length < i) {
            this.scriptEvaluationError(`${OP_default[currentOpcode]} stack too small for N, keys, M, sigs, and dummy. Need ${i}, have ${this.stack.length}.`);
          }
          const baseScriptCMS = this.context === "UnlockingScript" ? this.unlockingScript : this.lockingScript;
          const subscriptChunksCMS = baseScriptCMS.chunks.slice(this.lastCodeSeparator === null ? 0 : this.lastCodeSeparator + 1);
          subscript = new Script(subscriptChunksCMS);
          let hasNonEmptySignature = false;
          for (let k4 = 0; k4 < nSigsCount; k4++) {
            bufSig = this.stackTop(-isig - k4);
            if (bufSig.length > 0)
              hasNonEmptySignature = true;
            subscript.findAndDelete(new Script().writeBin(bufSig));
          }
          fSuccess = true;
          while (fSuccess && nSigsCount > 0) {
            if (nKeysCount === 0) {
              fSuccess = false;
              break;
            }
            bufSig = this.stackTop(-isig);
            bufPubkey = this.stackTop(-ikey);
            if (!this.checkSignatureEncoding(bufSig) || !this.checkPublicKeyEncoding(bufPubkey)) {
              this.scriptEvaluationError(`${OP_default[currentOpcode]} requires correct encoding for the public key and signature.`);
            }
            fOk = false;
            if (bufSig.length > 0) {
              try {
                sig = this.parseChecksigSignature(bufSig);
                pubkey = PublicKey.fromDER(bufPubkey);
                fOk = this.verifySignature(sig, pubkey, subscript);
              } catch {
                fOk = false;
              }
            }
            if (fOk) {
              isig++;
              nSigsCount--;
            }
            ikey++;
            nKeysCount--;
            if (nSigsCount > nKeysCount) {
              fSuccess = false;
            }
          }
          if (!fSuccess && this.hasFlag("NULLFAIL") && hasNonEmptySignature) {
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires failing signatures to be empty.`);
          }
          const itemsConsumedByOp = 1 + // N_val
          declaredKeyCount + // keys
          1 + // M_val
          declaredSigCount + // sigs
          1;
          let popCount = itemsConsumedByOp - 1;
          while (popCount > 0) {
            this.popStack();
            popCount--;
          }
          if (this.stack.length < 1) {
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires an extra item (dummy) to be on the stack.`);
          }
          const dummyBuf = this.popStack();
          if (this.shouldEnforceNullDummy() && dummyBuf.length > 0) {
            this.scriptEvaluationError(`${OP_default[currentOpcode]} requires the extra stack item (dummy) to be empty.`);
          }
          this.pushStack(fSuccess ? [1] : []);
          if (currentOpcode === OP_default.OP_CHECKMULTISIGVERIFY) {
            if (!fSuccess)
              this.scriptEvaluationError("OP_CHECKMULTISIGVERIFY requires that a sufficient number of valid signatures are provided.");
            this.popStack();
          }
          break;
        }
        case OP_default.OP_CAT: {
          if (this.stack.length < 2)
            this.scriptEvaluationError("OP_CAT requires at least two items to be on the stack.");
          buf2 = this.popStack();
          buf1 = this.popStack();
          const catResult = buf1.concat(buf2);
          if (catResult.length > this.maxPushSize())
            this.scriptEvaluationError(`It's not currently possible to push data larger than ${this.maxPushSize()} bytes.`);
          this.pushStack(catResult);
          break;
        }
        case OP_default.OP_SPLIT: {
          if (this.stack.length < 2)
            this.scriptEvaluationError("OP_SPLIT requires at least two items to be on the stack.");
          const posBuf = this.popStack();
          const dataToSplit = this.popStack();
          const splitIndexBigInt = this.readScriptNumber(posBuf).toBigInt();
          if (splitIndexBigInt < 0n || splitIndexBigInt > BigInt(dataToSplit.length)) {
            this.scriptEvaluationError("OP_SPLIT requires the first stack item to be a non-negative number less than or equal to the size of the second-from-top stack item.");
          }
          const splitIndex = Number(splitIndexBigInt);
          this.pushStack(dataToSplit.slice(0, splitIndex));
          this.pushStack(dataToSplit.slice(splitIndex));
          break;
        }
        case OP_default.OP_NUM2BIN: {
          if (this.stack.length < 2)
            this.scriptEvaluationError("OP_NUM2BIN requires at least two items to be on the stack.");
          const sizeBigInt = this.readScriptNumber(this.popStack()).toBigInt();
          if (sizeBigInt > BigInt(this.maxPushSize()) || sizeBigInt < 0n) {
            this.scriptEvaluationError(`It's not currently possible to push data larger than ${this.maxPushSize()} bytes or negative size.`);
          }
          size = Number(sizeBigInt);
          let rawnum = this.popStack();
          rawnum = minimallyEncode(rawnum);
          if (rawnum.length > size) {
            this.scriptEvaluationError("OP_NUM2BIN requires that the size expressed in the top stack item is large enough to hold the value expressed in the second-from-top stack item.");
          }
          if (rawnum.length === size) {
            this.pushStack(rawnum);
            break;
          }
          const resultN2B = new Array(size).fill(0);
          let signbit = 0;
          if (rawnum.length > 0) {
            signbit = rawnum.at(-1) & 128;
            rawnum[rawnum.length - 1] &= 127;
          }
          for (let k4 = 0; k4 < rawnum.length; k4++) {
            resultN2B[k4] = rawnum[k4];
          }
          if (signbit !== 0) {
            resultN2B[size - 1] |= 128;
          }
          this.pushStack(resultN2B);
          break;
        }
        case OP_default.OP_BIN2NUM: {
          if (this.stack.length < 1)
            this.scriptEvaluationError("OP_BIN2NUM requires at least one item to be on the stack.");
          buf1 = this.popStack();
          const b2nResult = minimallyEncode(buf1);
          if (!isMinimallyEncodedHelper(b2nResult)) {
            this.scriptEvaluationError("OP_BIN2NUM requires that the resulting number is valid.");
          }
          this.pushStack(b2nResult);
          break;
        }
        default:
          this.scriptEvaluationError(`Invalid opcode ${currentOpcode} (pc=${this.programCounter}).`);
      }
    }
    if (this.returningFromConditional && this.ifStack.length === 0) {
      this.programCounter = currentScript.chunks.length;
    } else {
      this.programCounter++;
    }
    if (this.hasExplicitFlags() && !this.isAfterGenesis() && this.stack.length + this.altStack.length > maxStackItemsBeforeGenesis) {
      this.scriptEvaluationError(`Stack item count has exceeded ${maxStackItemsBeforeGenesis}.`);
    }
    return true;
  }
  /**
   * @method validate
   * Validates the spend action by interpreting the locking and unlocking scripts.
   * @returns {boolean} Returns true if the scripts are valid and the spend is legitimate, otherwise false.
   * @example
   * if (spend.validate()) {
   *   console.log("Spend is valid!");
   * } else {
   *   console.log("Invalid spend!");
   * }
   */
  validate() {
    if (this.shouldEnforceSigPushOnly() && !this.unlockingScript.isPushOnly()) {
      this.scriptEvaluationError("Unlocking scripts can only contain push operations, and no other opcodes.");
    }
    const originalLockingScript = this.lockingScript;
    const shouldEvaluateP2SH = this.hasFlag("P2SH") && !this.isAfterGenesis() && this.isP2SHLockingScript(this.lockingScript);
    if (shouldEvaluateP2SH && !this.unlockingScript.isPushOnly()) {
      this.scriptEvaluationError("P2SH unlocking scripts can only contain push operations.");
    }
    this.reset();
    this.runScript("UnlockingScript");
    const stackAfterUnlockingScript = this.stack.map((item) => item.slice());
    this.runScript("LockingScript");
    this.requireTruthyTopStack();
    try {
      if (shouldEvaluateP2SH) {
        if (stackAfterUnlockingScript.length === 0) {
          this.scriptEvaluationError("P2SH evaluation requires a redeem script on the stack.");
        }
        const redeemScriptBytes = stackAfterUnlockingScript.pop();
        if (redeemScriptBytes === void 0) {
          this.scriptEvaluationError("P2SH evaluation requires a redeem script on the stack.");
          return false;
        }
        this.setStack(stackAfterUnlockingScript);
        const redeemScript = Script.fromBinary(redeemScriptBytes);
        this.lockingScript = new LockingScript(redeemScript.chunks);
        this.runScript("LockingScript");
      }
    } finally {
      this.lockingScript = originalLockingScript;
    }
    if (this.shouldEnforceCleanStack() && this.stack.length !== 1) {
      this.scriptEvaluationError(`The clean stack rule requires exactly one item to be on the stack after script execution, found ${this.stack.length}.`);
    }
    this.requireTruthyTopStack();
    return true;
  }
  runScript(context) {
    this.context = context;
    this.programCounter = 0;
    this.ifStack = [];
    this.elseStack = [];
    this.returningFromConditional = false;
    this.clearAltStack();
    this.lastCodeSeparator = null;
    const script = context === "UnlockingScript" ? this.unlockingScript : this.lockingScript;
    if (this.hasExplicitFlags() && !this.isAfterGenesis() && script.toUint8Array().length > maxScriptSizeBeforeGenesis) {
      this.scriptEvaluationError(`Script size exceeds ${maxScriptSizeBeforeGenesis} bytes.`);
    }
    while (this.programCounter < script.chunks.length) {
      this.step();
    }
    if (this.ifStack.length > 0) {
      this.scriptEvaluationError("Every OP_IF, OP_NOTIF, or OP_ELSE must be terminated with OP_ENDIF prior to the end of the script.");
    }
    this.ifStack = [];
    this.elseStack = [];
    this.clearAltStack();
    this.lastCodeSeparator = null;
  }
  isP2SHLockingScript(script) {
    const chunks = script.chunks;
    return chunks.length === 3 && chunks[0].op === OP_default.OP_HASH160 && chunks[1].op === 20 && Array.isArray(chunks[1].data) && chunks[1].data.length === 20 && chunks[2].op === OP_default.OP_EQUAL;
  }
  requireTruthyTopStack() {
    if (this.stack.length === 0) {
      this.scriptEvaluationError("The top stack element must be truthy after script evaluation (stack is empty).");
    } else if (!this.castToBool(this.stackTop())) {
      this.scriptEvaluationError("The top stack element must be truthy after script evaluation.");
    }
  }
  castToBool(val) {
    if (val.length === 0)
      return false;
    for (let i = 0; i < val.length; i++) {
      if (val[i] !== 0) {
        return !(i === val.length - 1 && val[i] === 128);
      }
    }
    return false;
  }
  scriptEvaluationError(str) {
    throw new ScriptEvaluationError({
      message: str,
      txid: this.sourceTXID,
      outputIndex: this.sourceOutputIndex,
      context: this.context,
      programCounter: this.programCounter,
      stackState: this.stack,
      altStackState: this.altStack,
      ifStackState: this.ifStack,
      stackMem: this.stackMem,
      altStackMem: this.altStackMem
    });
  }
};

// node_modules/@bsv/sdk/dist/esm/src/script/templates/SignatureUtils.js
function computeSignatureScope(signOutputs, anyoneCanPay) {
  let signatureScope = TransactionSignature.SIGHASH_FORKID;
  if (signOutputs === "all") {
    signatureScope |= TransactionSignature.SIGHASH_ALL;
  }
  if (signOutputs === "none") {
    signatureScope |= TransactionSignature.SIGHASH_NONE;
  }
  if (signOutputs === "single") {
    signatureScope |= TransactionSignature.SIGHASH_SINGLE;
  }
  if (anyoneCanPay) {
    signatureScope |= TransactionSignature.SIGHASH_ANYONECANPAY;
  }
  return signatureScope;
}
function resolveSourceDetails(tx, inputIndex, providedSourceSatoshis, providedLockingScript) {
  const input = tx.inputs[inputIndex];
  const otherInputs = tx.inputs.filter((_3, index) => index !== inputIndex);
  const sourceTXID = input.sourceTXID ?? input.sourceTransaction?.id("hex");
  if (sourceTXID == null || sourceTXID === void 0) {
    throw new Error("The input sourceTXID or sourceTransaction is required for transaction signing.");
  }
  if (sourceTXID === "") {
    throw new Error("The input sourceTXID or sourceTransaction is required for transaction signing.");
  }
  const sourceSatoshis = providedSourceSatoshis ?? input.sourceTransaction?.outputs[input.sourceOutputIndex].satoshis;
  if (sourceSatoshis == null || sourceSatoshis === void 0) {
    throw new Error("The sourceSatoshis or input sourceTransaction is required for transaction signing.");
  }
  const lockingScript = providedLockingScript ?? input.sourceTransaction?.outputs[input.sourceOutputIndex].lockingScript;
  if (lockingScript == null) {
    throw new Error("The lockingScript or input sourceTransaction is required for transaction signing.");
  }
  return { sourceTXID, sourceSatoshis, lockingScript, otherInputs };
}
function formatPreimage(params) {
  const { tx, inputIndex, signatureScope, sourceTXID, sourceSatoshis, lockingScript, otherInputs, inputSequence } = params;
  const input = tx.inputs[inputIndex];
  return TransactionSignature.format({
    sourceTXID,
    sourceOutputIndex: verifyNotNull(input.sourceOutputIndex, "input.sourceOutputIndex must have value"),
    sourceSatoshis,
    transactionVersion: tx.version,
    otherInputs,
    inputIndex,
    outputs: tx.outputs,
    inputSequence: inputSequence ?? verifyNotNull(input.sequence, "input.sequence must have value"),
    subscript: lockingScript,
    lockTime: tx.lockTime,
    scope: signatureScope
  });
}

// node_modules/@bsv/sdk/dist/esm/src/script/templates/P2PKH.js
var P2PKH = class {
  /**
   * Creates a P2PKH locking script for a given public key hash or address string
   *
   * @param {number[] | string} pubkeyhash or address - An array or address representing the public key hash.
   * @returns {LockingScript} - A P2PKH locking script.
   */
  lock(pubkeyhash) {
    let data;
    if (typeof pubkeyhash === "string") {
      const hash = fromBase58Check(pubkeyhash);
      if (hash.prefix[0] !== 0 && hash.prefix[0] !== 111) {
        throw new Error("only P2PKH is supported");
      }
      data = hash.data;
    } else {
      data = pubkeyhash;
    }
    if (data.length !== 20) {
      throw new Error("P2PKH hash length must be 20 bytes");
    }
    return new LockingScript([
      { op: OP_default.OP_DUP },
      { op: OP_default.OP_HASH160 },
      { op: data.length, data },
      { op: OP_default.OP_EQUALVERIFY },
      { op: OP_default.OP_CHECKSIG }
    ]);
  }
  /**
   * Creates a function that generates a P2PKH unlocking script along with its signature and length estimation.
   *
   * The returned object contains:
   * 1. `sign` - A function that, when invoked with a transaction and an input index,
   *    produces an unlocking script suitable for a P2PKH locked output.
   * 2. `estimateLength` - A function that returns the estimated length of the unlocking script in bytes.
   *
   * @param {PrivateKey} privateKey - The private key used for signing the transaction.
   * @param {'all'|'none'|'single'} signOutputs - The signature scope for outputs.
   * @param {boolean} anyoneCanPay - Flag indicating if the signature allows for other inputs to be added later.
   * @param {number} sourceSatoshis - Optional. The amount being unlocked. Otherwise the input.sourceTransaction is required.
   * @param {Script} lockingScript - Optional. The lockinScript. Otherwise the input.sourceTransaction is required.
   * @returns {Object} - An object containing the `sign` and `estimateLength` functions.
   */
  unlock(privateKey, signOutputs = "all", anyoneCanPay = false, sourceSatoshis, lockingScript) {
    return {
      sign: async (tx, inputIndex) => {
        const signatureScope = computeSignatureScope(signOutputs, anyoneCanPay);
        const resolved = resolveSourceDetails(tx, inputIndex, sourceSatoshis, lockingScript);
        sourceSatoshis = resolved.sourceSatoshis;
        lockingScript = resolved.lockingScript;
        const preimage = formatPreimage({
          tx,
          inputIndex,
          signatureScope,
          sourceTXID: resolved.sourceTXID,
          sourceSatoshis: resolved.sourceSatoshis,
          lockingScript: resolved.lockingScript,
          otherInputs: resolved.otherInputs
        });
        const rawSignature = privateKey.sign(sha256(preimage));
        const sig = new TransactionSignature(rawSignature.r, rawSignature.s, signatureScope);
        const sigForScript = sig.toChecksigFormat();
        const pubkeyForScript = privateKey.toPublicKey().encode(true);
        return new UnlockingScript([
          { op: sigForScript.length, data: sigForScript },
          { op: pubkeyForScript.length, data: pubkeyForScript }
        ]);
      },
      estimateLength: async () => {
        return 108;
      }
    };
  }
};

// node_modules/@bsv/sdk/dist/esm/src/transaction/fee-models/SatoshisPerKilobyte.js
var SatoshisPerKilobyte = class {
  /**
   * @property
   * Denotes the number of satoshis paid per kilobyte of transaction size.
   */
  value;
  /**
   * Constructs an instance of the sat/kb fee model.
   *
   * @param {number} value - The number of satoshis per kilobyte to charge as a fee.
   */
  constructor(value) {
    this.value = value;
  }
  /**
   * Computes the fee for a given transaction.
   *
   * @param tx The transaction for which a fee is to be computed.
   * @returns The fee in satoshis for the transaction, as a BigNumber.
   */
  async computeFee(tx) {
    const getVarIntSize = (i) => {
      if (i > 2 ** 32) {
        return 9;
      } else if (i > 2 ** 16) {
        return 5;
      } else if (i > 253) {
        return 3;
      } else {
        return 1;
      }
    };
    let size = 4;
    size += getVarIntSize(tx.inputs.length);
    for (let i = 0; i < tx.inputs.length; i++) {
      const input = tx.inputs[i];
      size += 40;
      let scriptLength;
      if (typeof input.unlockingScript === "object") {
        scriptLength = input.unlockingScript.toBinary().length;
      } else if (typeof input.unlockingScriptTemplate === "object") {
        scriptLength = await input.unlockingScriptTemplate.estimateLength(tx, i);
      } else {
        throw new TypeError("All inputs must have an unlocking script or an unlocking script template for sat/kb fee computation.");
      }
      size += getVarIntSize(scriptLength);
      size += scriptLength;
    }
    size += getVarIntSize(tx.outputs.length);
    for (const out of tx.outputs) {
      size += 8;
      const length = out.lockingScript.toBinary().length;
      size += getVarIntSize(length);
      size += length;
    }
    size += 4;
    const fee = Math.ceil(size / 1e3 * this.value);
    return fee;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/transaction/fee-models/LivePolicy.js
var LivePolicy = class _LivePolicy extends SatoshisPerKilobyte {
  static ARC_POLICY_URL = "https://arc.gorillapool.io/v1/policy";
  static instance = null;
  cachedRate = null;
  cacheTimestamp = 0;
  cacheValidityMs;
  /**
   * Constructs an instance of the live policy fee model.
   *
   * @param {number} cacheValidityMs - How long to cache the fee rate in milliseconds (default: 5 minutes)
   */
  constructor(cacheValidityMs = 5 * 60 * 1e3) {
    super(100);
    this.cacheValidityMs = cacheValidityMs;
  }
  /**
   * Gets the singleton instance of LivePolicy to ensure cache sharing across the application.
   *
   * @param {number} cacheValidityMs - How long to cache the fee rate in milliseconds (default: 5 minutes)
   * @returns The singleton LivePolicy instance
   */
  static getInstance(cacheValidityMs = 5 * 60 * 1e3) {
    if (!_LivePolicy.instance) {
      _LivePolicy.instance = new _LivePolicy(cacheValidityMs);
    }
    return _LivePolicy.instance;
  }
  /**
   * Fetches the current fee rate from ARC GorillaPool API.
   *
   * @returns The current satoshis per kilobyte rate
   */
  async fetchFeeRate() {
    const now = Date.now();
    if (this.cachedRate !== null && now - this.cacheTimestamp < this.cacheValidityMs) {
      return this.cachedRate;
    }
    try {
      const response = await fetch(_LivePolicy.ARC_POLICY_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const response_data = await response.json();
      if (!response_data.policy?.miningFee || typeof response_data.policy.miningFee.satoshis !== "number" || typeof response_data.policy.miningFee.bytes !== "number") {
        throw new Error("Invalid policy response format");
      }
      const rate = response_data.policy.miningFee.satoshis / response_data.policy.miningFee.bytes * 1e3;
      this.cachedRate = rate;
      this.cacheTimestamp = now;
      return rate;
    } catch (error) {
      if (this.cachedRate !== null) {
        console.warn("Failed to fetch live fee rate, using cached value:", error);
        return this.cachedRate;
      }
      console.warn("Failed to fetch live fee rate, using default 100 sat/kb:", error);
      return 100;
    }
  }
  /**
   * Computes the fee for a given transaction using the current live rate.
   * Overrides the parent method to use dynamic rate fetching.
   *
   * @param tx The transaction for which a fee is to be computed.
   * @returns The fee in satoshis for the transaction.
   */
  async computeFee(tx) {
    const rate = await this.fetchFeeRate();
    this.value = rate;
    return super.computeFee(tx);
  }
};

// node_modules/@bsv/sdk/dist/esm/src/transaction/http/NodejsHttpRequestUtils.js
function executeNodejsRequest(https, url, requestOptions, serializeData) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, requestOptions, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        const ok = res.statusCode >= 200 && res.statusCode <= 299;
        const mediaType = res.headers["content-type"];
        const data = body !== "" && typeof mediaType === "string" && mediaType.startsWith("application/json") ? JSON.parse(body) : body;
        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          ok,
          data
        });
      });
    });
    req.on("error", (error) => {
      reject(error);
    });
    if (requestOptions.data !== null && requestOptions.data !== void 0) {
      req.write(serializeData(requestOptions.data));
    }
    req.end();
  });
}

// node_modules/@bsv/sdk/dist/esm/src/transaction/http/NodejsHttpClient.js
var NodejsHttpClient = class {
  https;
  constructor(https) {
    this.https = https;
  }
  async request(url, requestOptions) {
    return await executeNodejsRequest(this.https, url, requestOptions, (data) => JSON.stringify(data));
  }
};

// node_modules/@bsv/sdk/dist/esm/src/transaction/http/FetchHttpClient.js
var FetchHttpClient = class {
  fetch;
  constructor(fetch2) {
    this.fetch = fetch2;
  }
  async request(url, options) {
    const fetchOptions = {
      method: options.method,
      headers: options.headers,
      body: JSON.stringify(options.data)
    };
    const res = await this.fetch(url, fetchOptions);
    const mediaType = res.headers.get("Content-Type");
    const data = mediaType?.startsWith("application/json") ?? false ? await res.json() : await res.text();
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      data
    };
  }
};

// node_modules/@bsv/sdk/dist/esm/src/transaction/http/DefaultHttpClient.js
function defaultHttpClient() {
  const noHttpClient = {
    async request(..._3) {
      throw new Error("No method available to perform HTTP request");
    }
  };
  if (globalThis.window !== void 0 && typeof globalThis.window.fetch === "function") {
    return new FetchHttpClient(globalThis.window.fetch.bind(globalThis.window));
  } else if (typeof globalThis.fetch === "function") {
    return new FetchHttpClient(globalThis.fetch.bind(globalThis));
  } else if (typeof __require === "undefined") {
    return noHttpClient;
  } else {
    try {
      const https = __require("node:https");
      return new NodejsHttpClient(https);
    } catch (_httpsModuleUnavailable) {
      return noHttpClient;
    }
  }
}

// node_modules/@bsv/sdk/dist/esm/src/transaction/broadcasters/ARC.js
function defaultDeploymentId() {
  return `ts-sdk-${toHex(Random_default(16))}`;
}
var ARC = class {
  URL;
  apiKey;
  deploymentId;
  callbackUrl;
  callbackToken;
  headers;
  httpClient;
  constructor(URL2, config) {
    this.URL = URL2;
    if (typeof config === "string") {
      this.apiKey = config;
      this.httpClient = defaultHttpClient();
      this.deploymentId = defaultDeploymentId();
      this.callbackToken = void 0;
      this.callbackUrl = void 0;
    } else {
      const configObj = config ?? {};
      const { apiKey, deploymentId, httpClient, callbackToken, callbackUrl, headers } = configObj;
      this.apiKey = apiKey;
      this.httpClient = httpClient ?? defaultHttpClient();
      this.deploymentId = deploymentId ?? defaultDeploymentId();
      this.callbackToken = callbackToken;
      this.callbackUrl = callbackUrl;
      this.headers = headers;
    }
  }
  /**
   * Constructs a dictionary of the default & supplied request headers.
   */
  requestHeaders() {
    const headers = {
      "Content-Type": "application/json",
      "XDeployment-ID": this.deploymentId
    };
    if (this.apiKey != null && this.apiKey !== "") {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    if (this.callbackUrl != null && this.callbackUrl !== "") {
      headers["X-CallbackUrl"] = this.callbackUrl;
    }
    if (this.callbackToken != null && this.callbackToken !== "") {
      headers["X-CallbackToken"] = this.callbackToken;
    }
    if (this.headers != null) {
      for (const key in this.headers) {
        headers[key] = this.headers[key];
      }
    }
    return headers;
  }
  /**
   * Broadcasts a transaction via ARC.
   *
   * @param {Transaction} tx - The transaction to be broadcasted.
   * @returns {Promise<BroadcastResponse | BroadcastFailure>} A promise that resolves to either a success or failure response.
   */
  async broadcast(tx) {
    let rawTx;
    try {
      rawTx = tx.toHexEF();
    } catch (error) {
      if (error.message === "All inputs must have source transactions when serializing to EF format") {
        rawTx = tx.toHex();
      } else {
        throw error;
      }
    }
    const requestOptions = {
      method: "POST",
      headers: this.requestHeaders(),
      data: { rawTx }
    };
    try {
      const response = await this.httpClient.request(`${this.URL}/v1/tx`, requestOptions);
      if (response.ok) {
        const { txid, extraInfo, txStatus, competingTxs } = response.data;
        const errorStatuses = [
          "DOUBLE_SPEND_ATTEMPTED",
          "REJECTED",
          "INVALID",
          "MALFORMED",
          "MINED_IN_STALE_BLOCK"
        ];
        const isOrphan = extraInfo?.toUpperCase().includes("ORPHAN") || txStatus?.toUpperCase().includes("ORPHAN");
        if (errorStatuses.includes(txStatus?.toUpperCase()) || isOrphan) {
          const failure = {
            status: "error",
            code: txStatus ?? "UNKNOWN",
            txid,
            description: `${txStatus ?? ""} ${extraInfo ?? ""}`.trim()
          };
          if (competingTxs != null) {
            failure.more = { competingTxs };
          }
          return failure;
        }
        const broadcastRes = {
          status: "success",
          txid,
          message: `${txStatus} ${extraInfo}`
        };
        if (competingTxs != null) {
          broadcastRes.competingTxs = competingTxs;
        }
        return broadcastRes;
      } else {
        const st = typeof response.status;
        const r3 = {
          status: "error",
          code: st === "number" || st === "string" ? response.status.toString() : "ERR_UNKNOWN",
          description: "Unknown error"
        };
        let d5 = response.data;
        if (typeof d5 === "string") {
          try {
            d5 = JSON.parse(response.data);
          } catch {
          }
        }
        if (typeof d5 === "object") {
          if (d5 !== null) {
            r3.more = d5;
          }
          if (d5 != null && typeof d5.txid === "string") {
            r3.txid = d5.txid;
          }
          if (d5 != null && "detail" in d5 && typeof d5.detail === "string") {
            r3.description = d5.detail;
          }
        }
        return r3;
      }
    } catch (error) {
      return {
        status: "error",
        code: "500",
        description: typeof error.message === "string" ? error.message : "Internal Server Error"
      };
    }
  }
  /**
   * Broadcasts multiple transactions via ARC.
   * Handles mixed responses where some transactions succeed and others fail.
   *
   * @param {Transaction[]} txs - Array of transactions to be broadcasted.
   * @returns {Promise<Array<object>>} A promise that resolves to an array of objects.
   */
  async broadcastMany(txs) {
    const rawTxs = txs.map((tx) => {
      try {
        return { rawTx: tx.toHexEF() };
      } catch (error) {
        if (error.message === "All inputs must have source transactions when serializing to EF format") {
          return { rawTx: tx.toHex() };
        }
        throw error;
      }
    });
    const requestOptions = {
      method: "POST",
      headers: this.requestHeaders(),
      data: rawTxs
    };
    try {
      const response = await this.httpClient.request(`${this.URL}/v1/txs`, requestOptions);
      return response.data;
    } catch (error) {
      const errorResponse = {
        status: "error",
        code: "500",
        description: typeof error.message === "string" ? error.message : "Internal Server Error"
      };
      return txs.map(() => errorResponse);
    }
  }
};

// node_modules/@bsv/sdk/dist/esm/src/transaction/broadcasters/DefaultBroadcaster.js
function defaultBroadcaster(isTestnet = false, config = {}) {
  return new ARC(isTestnet ? "https://testnet.arc.gorillapool.io" : "https://arc.gorillapool.io", config);
}

// node_modules/@bsv/sdk/dist/esm/src/transaction/chaintrackers/WhatsOnChain.js
var WhatsOnChain = class {
  network;
  apiKey;
  URL;
  httpClient;
  /**
   * Constructs an instance of the WhatsOnChain ChainTracker.
   *
   * @param {'main' | 'test' | 'stn'} network - The BSV network to use when calling the WhatsOnChain API.
   * @param {WhatsOnChainConfig} config - Configuration options for the WhatsOnChain ChainTracker.
   */
  constructor(network = "main", config = {}) {
    const { apiKey, httpClient } = config;
    this.network = network;
    this.URL = `https://api.whatsonchain.com/v1/bsv/${network}`;
    this.httpClient = httpClient ?? defaultHttpClient();
    this.apiKey = apiKey ?? "";
  }
  async isValidRootForHeight(root, height) {
    const requestOptions = {
      method: "GET",
      headers: this.getHttpHeaders()
    };
    const response = await this.httpClient.request(`${this.URL}/block/${height}/header`, requestOptions);
    if (response.ok) {
      const { merkleroot } = response.data;
      return merkleroot === root;
    } else if (response.status === 404) {
      return false;
    } else {
      throw new Error(`Failed to verify merkleroot for height ${height} because of an error: ${JSON.stringify(response.data)} `);
    }
  }
  async currentHeight() {
    try {
      const requestOptions = {
        method: "GET",
        headers: this.getHttpHeaders()
      };
      const response = await this.httpClient.request(`${this.URL}/block/headers`, requestOptions);
      if (response.ok) {
        return response.data[0].height;
      } else {
        throw new Error(`Failed to get current height because of an error: ${JSON.stringify(response.data)} `);
      }
    } catch (error) {
      throw new Error(`Failed to get current height because of an error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  getHttpHeaders() {
    const headers = {
      Accept: "application/json"
    };
    if (typeof this.apiKey === "string" && this.apiKey.trim() !== "") {
      headers.Authorization = this.apiKey;
    }
    return headers;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/transaction/chaintrackers/DefaultChainTracker.js
function defaultChainTracker() {
  return new WhatsOnChain();
}

// node_modules/@bsv/sdk/dist/esm/src/transaction/MerklePath.js
var MerklePath = class _MerklePath {
  blockHeight;
  path;
  /**
   * Creates a MerklePath instance from a hexadecimal string.
   *
   * @static
   * @param {string} hex - The hexadecimal string representation of the Merkle Path.
   * @returns {MerklePath} - A new MerklePath instance.
   */
  static fromHex(hex) {
    return _MerklePath.fromBinary(toArray2(hex, "hex"));
  }
  static fromReader(reader, legalOffsetsOnly = true) {
    const blockHeight = reader.readVarIntNum();
    const treeHeight = reader.readUInt8();
    const path = new Array(treeHeight).fill(null).map(() => []);
    let flags, offset, nLeavesAtThisHeight;
    for (let level = 0; level < treeHeight; level++) {
      nLeavesAtThisHeight = reader.readVarIntNum();
      while (nLeavesAtThisHeight > 0) {
        offset = reader.readVarIntNum();
        flags = reader.readUInt8();
        const leaf = { offset };
        if ((flags & 1) === 1) {
          leaf.duplicate = true;
        } else {
          if ((flags & 2) !== 0) {
            leaf.txid = true;
          }
          leaf.hash = toHex(reader.read(32).reverse());
        }
        if (!Array.isArray(path[level]) || path[level].length === 0) {
          path[level] = [];
        }
        path[level].push(leaf);
        nLeavesAtThisHeight--;
      }
      path[level].sort((a4, b5) => a4.offset - b5.offset);
    }
    return new _MerklePath(blockHeight, path, legalOffsetsOnly);
  }
  /**
   * Creates a MerklePath instance from a binary array.
   *
   * @static
   * @param {number[]} bump - The binary array representation of the Merkle Path.
   * @returns {MerklePath} - A new MerklePath instance.
   */
  static fromBinary(bump) {
    const reader = new ReaderUint8Array(bump);
    return _MerklePath.fromReader(reader);
  }
  /**
   *
   * @static fromCoinbaseTxid
   *
   * Creates a MerklePath instance for a coinbase transaction in an empty block.
   * This edge case is difficult to retrieve from standard APIs.
   *
   * @param {string} txid - The coinbase txid.
   * @param {number} height - The height of the block.
   * @returns {MerklePath} - A new MerklePath instance which assumes the tx is in a block with no other transactions.
   */
  static fromCoinbaseTxidAndHeight(txid, height) {
    return new _MerklePath(height, [[{ offset: 0, hash: txid, txid: true }]]);
  }
  constructor(blockHeight, path, legalOffsetsOnly = true) {
    this.blockHeight = blockHeight;
    this.path = path;
    const legalOffsets = new Array(this.path.length).fill(0).map(() => /* @__PURE__ */ new Set());
    this.path.forEach((leaves, height) => {
      if (leaves.length === 0 && height === 0) {
        throw new Error(`Empty level at height: ${height}`);
      }
      const offsetsAtThisHeight = /* @__PURE__ */ new Set();
      leaves.forEach((leaf) => {
        if (offsetsAtThisHeight.has(leaf.offset)) {
          throw new Error(`Duplicate offset: ${leaf.offset}, at height: ${height}`);
        }
        offsetsAtThisHeight.add(leaf.offset);
        if (height === 0) {
          if (leaf.duplicate !== true) {
            for (let h4 = 1; h4 < this.path.length; h4++) {
              legalOffsets[h4].add(leaf.offset >> h4 ^ 1);
            }
          }
        } else if (legalOffsetsOnly && !legalOffsets[height].has(leaf.offset)) {
          throw new Error(`Invalid offset: ${leaf.offset}, at height: ${height}, with legal offsets: ${Array.from(legalOffsets[height]).join(", ")}`);
        }
      });
    });
    let root;
    this.path[0].forEach((leaf, idx) => {
      if (idx === 0)
        root = this.computeRoot(leaf.hash);
      if (root !== this.computeRoot(leaf.hash)) {
        throw new Error("Mismatched roots");
      }
    });
  }
  /**
   * Serializes the MerklePath to the writer provided.
   *
   * @param writer - The writer to which the Merkle Path will be serialized.
   */
  toWriter(writer) {
    writer.writeVarIntNum(this.blockHeight);
    const treeHeight = this.path.length;
    writer.writeUInt8(treeHeight);
    for (let level = 0; level < treeHeight; level++) {
      const nLeaves = Object.keys(this.path[level]).length;
      writer.writeVarIntNum(nLeaves);
      for (const leaf of this.path[level]) {
        writer.writeVarIntNum(leaf.offset);
        let flags = 0;
        if (leaf?.duplicate === true) {
          flags |= 1;
        }
        if (leaf?.txid !== void 0 && leaf.txid !== null) {
          flags |= 2;
        }
        writer.writeUInt8(flags);
        if ((flags & 1) === 0) {
          writer.write(toArray2(leaf.hash, "hex").reverse());
        }
      }
    }
  }
  /**
   * Converts the MerklePath to a binary array format.
   *
   * @returns {number[]} - The binary array representation of the Merkle Path.
   */
  toBinary() {
    const writer = new Writer();
    this.toWriter(writer);
    return writer.toArray();
  }
  /**
   * Converts the MerklePath to a binary array format.
   *
   * @returns {Uint8Array} - The binary array representation of the Merkle Path.
   */
  toBinaryUint8Array() {
    const writer = new WriterUint8Array();
    this.toWriter(writer);
    return writer.toUint8Array();
  }
  /**
   * Converts the MerklePath to a hexadecimal string format.
   *
   * @returns {string} - The hexadecimal string representation of the Merkle Path.
   */
  toHex() {
    return toHex(this.toBinaryUint8Array());
  }
  //
  indexOf(txid) {
    const leaf = this.path[0].find((l6) => l6.hash === txid);
    if (leaf === null || leaf === void 0) {
      throw new Error(`Transaction ID ${txid} not found in the Merkle Path`);
    }
    return leaf.offset;
  }
  /**
   * Computes the Merkle root from the provided transaction ID.
   *
   * @param {string} txid - The transaction ID to compute the Merkle root for. If not provided, the root will be computed from an unspecified branch, and not all branches will be validated!
   * @returns {string} - The computed Merkle root as a hexadecimal string.
   * @throws {Error} - If the transaction ID is not part of the Merkle Path.
   */
  computeRoot(txid) {
    if (typeof txid !== "string") {
      const foundLeaf = this.path[0].find((leaf) => Boolean(leaf?.hash));
      if (foundLeaf == null) {
        throw new Error("No valid leaf found in the Merkle Path");
      }
      txid = foundLeaf.hash;
    }
    if (typeof txid !== "string") {
      throw new TypeError("Transaction ID is undefined");
    }
    const index = this.indexOf(txid);
    const hash = (m4) => toHex(hash256(toArray2(m4, "hex").reverse()).reverse());
    let workingHash = txid;
    if (this.path.length === 1 && this.path[0].length === 1)
      return workingHash;
    const maxOffset = this.path[0].reduce((max, l6) => Math.max(max, l6.offset), 0);
    const treeHeight = Math.max(this.path.length, 32 - Math.clz32(maxOffset));
    for (let height = 0; height < treeHeight; height++) {
      const offset = index >> height ^ 1;
      const leaf = this.findOrComputeLeaf(height, offset);
      if (typeof leaf !== "object") {
        if (this.path.length === 1 && index >> height === maxOffset >> height) {
          workingHash = hash((workingHash ?? "") + (workingHash ?? ""));
          continue;
        }
        throw new Error(`Missing hash for index ${index} at height ${height}`);
      } else if (leaf.duplicate === true) {
        workingHash = hash((workingHash ?? "") + (workingHash ?? ""));
      } else if (offset % 2 === 1) {
        workingHash = hash((leaf.hash ?? "") + (workingHash ?? ""));
      } else {
        workingHash = hash((workingHash ?? "") + (leaf.hash ?? ""));
      }
    }
    return workingHash;
  }
  /**
   * Find leaf with `offset` at `height` or compute from level below, recursively.
   *
   * Does not add computed leaves to path.
   *
   * @param height
   * @param offset
   */
  findOrComputeLeaf(height, offset) {
    const hash = (m4) => toHex(hash256(toArray2(m4, "hex").reverse()).reverse());
    let leaf = height < this.path.length ? this.path[height].find((l7) => l7.offset === offset) : void 0;
    if (leaf != null)
      return leaf;
    if (height === 0)
      return void 0;
    const h4 = height - 1;
    const l6 = offset << 1;
    const leaf0 = this.findOrComputeLeaf(h4, l6);
    if (leaf0?.hash == null || leaf0.hash === "")
      return void 0;
    const leaf1 = this.findOrComputeLeaf(h4, l6 + 1);
    if (leaf1?.hash == null) {
      if (leaf1?.duplicate === true) {
        return { offset, hash: hash(leaf0.hash + leaf0.hash) };
      }
      if (this.path.length === 1) {
        const maxOffset0 = this.path[0].reduce((max, lf) => Math.max(max, lf.offset), 0);
        if (l6 === maxOffset0 >> h4) {
          return { offset, hash: hash(leaf0.hash + leaf0.hash) };
        }
      }
      return void 0;
    }
    let workinghash;
    if (leaf1.duplicate === true) {
      workinghash = hash(leaf0.hash + leaf0.hash);
    } else {
      workinghash = hash((leaf1.hash ?? "") + (leaf0.hash ?? ""));
    }
    leaf = {
      offset,
      hash: workinghash
    };
    return leaf;
  }
  /**
   * Verifies if the given transaction ID is part of the Merkle tree at the specified block height.
   *
   * @param {string} txid - The transaction ID to verify.
   * @param {ChainTracker} chainTracker - The ChainTracker instance used to verify the Merkle root.
   * @returns {boolean} - True if the transaction ID is valid within the Merkle Path at the specified block height.
   */
  async verify(txid, chainTracker) {
    const root = this.computeRoot(txid);
    if (this.indexOf(txid) === 0) {
      const height = await chainTracker.currentHeight();
      if (this.blockHeight + 100 > height) {
        return false;
      }
    }
    return await chainTracker.isValidRootForHeight(root, this.blockHeight);
  }
  /**
   * Combines this MerklePath with another to create a compound proof.
   *
   * @param {MerklePath} other - Another MerklePath to combine with this path.
   * @throws {Error} - If the paths have different block heights or roots.
   */
  combine(other) {
    if (this.blockHeight !== other.blockHeight) {
      throw new Error("You cannot combine paths which do not have the same block height.");
    }
    const root1 = this.computeRoot();
    const root2 = other.computeRoot();
    if (root1 !== root2) {
      throw new Error("You cannot combine paths which do not have the same root.");
    }
    const combinedPath = [];
    for (let h4 = 0; h4 < this.path.length; h4++) {
      combinedPath.push([]);
      for (const leaf of this.path[h4]) {
        combinedPath[h4].push(leaf);
      }
      for (const otherLeaf of other.path[h4]) {
        const existingLeaf = combinedPath[h4].find((leaf) => leaf.offset === otherLeaf.offset);
        if (existingLeaf === void 0) {
          combinedPath[h4].push(otherLeaf);
        } else if (otherLeaf?.txid !== void 0 && otherLeaf?.txid !== null) {
          existingLeaf.txid = true;
        }
      }
    }
    this.path = combinedPath;
    this.trim();
  }
  /**
   * Remove all internal nodes that are not required by level zero txid nodes.
   * Assumes that at least all required nodes are present.
   * Leaves all levels sorted by increasing offset.
   */
  trim() {
    const pushIfNew = (v3, a4) => {
      if (a4.length === 0 || a4.at(-1) !== v3) {
        a4.push(v3);
      }
    };
    const dropOffsetsFromLevel = (dropOffsets2, level) => {
      for (let i = dropOffsets2.length; i >= 0; i--) {
        const l6 = this.path[level].findIndex((n2) => n2.offset === dropOffsets2[i]);
        if (l6 >= 0) {
          this.path[level].splice(l6, 1);
        }
      }
    };
    const nextComputedOffsets = (cos) => {
      const ncos = [];
      for (const o5 of cos) {
        pushIfNew(o5 >> 1, ncos);
      }
      return ncos;
    };
    let computedOffsets = [];
    let dropOffsets = [];
    for (const level of this.path) {
      level.sort((a4, b5) => a4.offset - b5.offset);
    }
    for (let l6 = 0; l6 < this.path[0].length; l6++) {
      const n2 = this.path[0][l6];
      if (n2.txid === true) {
        pushIfNew(n2.offset >> 1, computedOffsets);
      } else {
        const isOdd = n2.offset % 2 === 1;
        const peer = this.path[0][l6 + (isOdd ? -1 : 1)];
        if (peer.txid === void 0 || peer.txid === null || !peer.txid) {
          pushIfNew(peer.offset, dropOffsets);
        }
      }
    }
    dropOffsetsFromLevel(dropOffsets, 0);
    for (let h4 = 1; h4 < this.path.length; h4++) {
      dropOffsets = computedOffsets;
      computedOffsets = nextComputedOffsets(computedOffsets);
      dropOffsetsFromLevel(dropOffsets, h4);
    }
  }
  /**
   * Cached leaf finder for extract(). Uses Map-based indexes for O(1) lookups
   * and caches computed intermediate hashes to avoid redundant work.
   */
  cachedFindLeaf(height, offset, sourceIndex, hashCache, maxOffset) {
    const key = `${height}:${offset}`;
    if (hashCache.has(key))
      return hashCache.get(key);
    const doHash = (m4) => toHex(hash256(toArray2(m4, "hex").reverse()).reverse());
    let leaf = height < sourceIndex.length ? sourceIndex[height].get(offset) : void 0;
    if (leaf != null) {
      hashCache.set(key, leaf);
      return leaf;
    }
    if (height === 0) {
      hashCache.set(key, void 0);
      return void 0;
    }
    const h4 = height - 1;
    const l6 = offset << 1;
    const leaf0 = this.cachedFindLeaf(h4, l6, sourceIndex, hashCache, maxOffset);
    if (leaf0?.hash == null || leaf0.hash === "") {
      hashCache.set(key, void 0);
      return void 0;
    }
    const leaf1 = this.cachedFindLeaf(h4, l6 + 1, sourceIndex, hashCache, maxOffset);
    if (leaf1?.hash == null) {
      if (leaf1?.duplicate === true || this.path.length === 1 && l6 === maxOffset >> h4) {
        leaf = { offset, hash: doHash(leaf0.hash + leaf0.hash) };
        hashCache.set(key, leaf);
        return leaf;
      }
      hashCache.set(key, void 0);
      return void 0;
    }
    const workinghash = leaf1.duplicate === true ? doHash(leaf0.hash + leaf0.hash) : doHash((leaf1.hash ?? "") + (leaf0.hash ?? ""));
    leaf = { offset, hash: workinghash };
    hashCache.set(key, leaf);
    return leaf;
  }
  /**
   * Extracts a minimal compound MerklePath covering only the specified transaction IDs.
   *
   * Given a compound MerklePath (e.g. all block txids at level 0, or a trimmed
   * compound path), this method reconstructs the sibling hashes at each tree level
   * for every requested txid using cached Map-indexed lookups, then assembles them
   * into a single trimmed compound path.
   *
   * The extracted path is verified to compute the same Merkle root as the source.
   *
   * @param {string[]} txids - Transaction IDs to extract proofs for.
   * @returns {MerklePath} - A new trimmed compound MerklePath covering only the requested txids.
   * @throws {Error} - If no txids are provided, a txid is not found, or the roots do not match.
   *
   * @example
   * // Full block compound path (all txids at level 0)
   * const fullBlock = new MerklePath(height, [allTxidsAtLevel0])
   * // Extract a smaller compound proof covering just two transactions
   * const twoTxProof = fullBlock.extract([txid1, txid2])
   * twoTxProof.computeRoot(txid1) // === fullBlock.computeRoot()
   */
  extract(txids) {
    if (txids.length === 0) {
      throw new Error("At least one txid must be provided to extract");
    }
    const originalRoot = this.computeRoot();
    const maxOffset = this.path[0].reduce((max, l6) => Math.max(max, l6.offset), 0);
    const treeHeight = Math.max(this.path.length, 32 - Math.clz32(maxOffset));
    const sourceIndex = new Array(this.path.length);
    for (let h4 = 0; h4 < this.path.length; h4++) {
      const map = /* @__PURE__ */ new Map();
      for (const leaf of this.path[h4])
        map.set(leaf.offset, leaf);
      sourceIndex[h4] = map;
    }
    const hashCache = /* @__PURE__ */ new Map();
    const txidToOffset = /* @__PURE__ */ new Map();
    for (const leaf of this.path[0]) {
      if (leaf.hash != null)
        txidToOffset.set(leaf.hash, leaf.offset);
    }
    const neededPerLevel = new Array(treeHeight);
    for (let h4 = 0; h4 < treeHeight; h4++)
      neededPerLevel[h4] = /* @__PURE__ */ new Map();
    for (const txid of txids) {
      const txOffset = txidToOffset.get(txid);
      if (txOffset === void 0) {
        throw new Error(`Transaction ID ${txid} not found in the Merkle Path`);
      }
      neededPerLevel[0].set(txOffset, { offset: txOffset, txid: true, hash: txid });
      const sib0Offset = txOffset ^ 1;
      if (!neededPerLevel[0].has(sib0Offset)) {
        const sib = this.cachedFindLeaf(0, sib0Offset, sourceIndex, hashCache, maxOffset);
        if (sib != null)
          neededPerLevel[0].set(sib0Offset, sib);
      }
      for (let h4 = 1; h4 < treeHeight; h4++) {
        const sibOffset = txOffset >> h4 ^ 1;
        if (neededPerLevel[h4].has(sibOffset))
          continue;
        const sib = this.cachedFindLeaf(h4, sibOffset, sourceIndex, hashCache, maxOffset);
        if (sib != null) {
          neededPerLevel[h4].set(sibOffset, sib);
        } else if (txOffset >> h4 === maxOffset >> h4) {
          neededPerLevel[h4].set(sibOffset, { offset: sibOffset, duplicate: true });
        }
      }
    }
    const compoundPath = new Array(treeHeight);
    for (let h4 = 0; h4 < treeHeight; h4++) {
      compoundPath[h4] = Array.from(neededPerLevel[h4].values()).sort((a4, b5) => a4.offset - b5.offset);
    }
    const compound = new _MerklePath(this.blockHeight, compoundPath);
    compound.trim();
    const extractedRoot = compound.computeRoot();
    if (extractedRoot !== originalRoot) {
      throw new Error(`Extracted path root ${extractedRoot} does not match original root ${originalRoot}`);
    }
    return compound;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/transaction/BeefConstants.js
var BEEF_V1 = 4022206465;
var BEEF_V2 = 4022206466;
var ATOMIC_BEEF = 16843009;
var TX_DATA_FORMAT;
(function(TX_DATA_FORMAT2) {
  TX_DATA_FORMAT2[TX_DATA_FORMAT2["RAWTX"] = 0] = "RAWTX";
  TX_DATA_FORMAT2[TX_DATA_FORMAT2["RAWTX_AND_BUMP_INDEX"] = 1] = "RAWTX_AND_BUMP_INDEX";
  TX_DATA_FORMAT2[TX_DATA_FORMAT2["TXID_ONLY"] = 2] = "TXID_ONLY";
})(TX_DATA_FORMAT || (TX_DATA_FORMAT = {}));

// node_modules/@bsv/sdk/dist/esm/src/transaction/BeefTx.js
var BeefTx = class _BeefTx {
  _bumpIndex;
  _tx;
  _rawTx;
  _txid;
  inputTxids = [];
  /**
   * true if `hasProof` or all inputs chain to `hasProof`.
   *
   * Typically set by sorting transactions by proven dependency chains.
   */
  isValid = void 0;
  get bumpIndex() {
    return this._bumpIndex;
  }
  set bumpIndex(v3) {
    this._bumpIndex = v3;
    this.updateInputTxids();
  }
  get hasProof() {
    return this._bumpIndex !== void 0;
  }
  get isTxidOnly() {
    return this._txid !== void 0 && this._txid !== null && this._rawTx == null && this._tx == null;
  }
  get txid() {
    if (this._txid !== void 0 && this._txid !== null && this._txid !== "")
      return this._txid;
    if (this._tx != null) {
      this._txid = this._tx.id("hex");
      return this._txid;
    }
    if (this._rawTx != null) {
      this._txid = toHex(hash256(this._rawTx));
      return this._txid;
    }
    throw new Error("Internal");
  }
  get tx() {
    if (this._tx != null)
      return this._tx;
    if (this._rawTx != null) {
      this._tx = Transaction.fromBinary(this._rawTx);
      return this._tx;
    }
    return void 0;
  }
  /**
   * Raw transaction bytes, if available as number[]
   */
  get rawTx() {
    if (this._rawTx != null) {
      return Array.from(this._rawTx);
    }
    if (this._tx != null) {
      const bytes2 = this._tx.toUint8Array();
      this._rawTx = bytes2;
      return Array.from(bytes2);
    }
    return void 0;
  }
  /**
   * Raw transaction bytes, if available as Uint8Array
   */
  get rawTxUint8Array() {
    if (this._rawTx != null)
      return this._rawTx;
    if (this._tx != null) {
      this._rawTx = this._tx.toUint8Array();
      return this._rawTx;
    }
    return void 0;
  }
  /**
   * @param tx If string, must be a valid txid. If `number[]` must be a valid serialized transaction.
   * @param bumpIndex If transaction already has a proof in the beef to which it will be added.
   */
  constructor(tx, bumpIndex) {
    if (typeof tx === "string") {
      this._txid = tx;
    } else if (tx instanceof Uint8Array) {
      this._rawTx = tx;
    } else if (Array.isArray(tx)) {
      this._rawTx = new Uint8Array(tx);
    } else if (tx instanceof Transaction) {
      this._tx = tx;
    } else {
      throw new TypeError("Invalid transaction data type");
    }
    this.bumpIndex = bumpIndex;
    this.updateInputTxids();
  }
  static fromTx(tx, bumpIndex) {
    return new _BeefTx(tx, bumpIndex);
  }
  static fromRawTx(rawTx, bumpIndex) {
    return new _BeefTx(rawTx, bumpIndex);
  }
  static fromTxid(txid, bumpIndex) {
    return new _BeefTx(txid, bumpIndex);
  }
  updateInputTxids() {
    if (this.hasProof || this.tx == null) {
      this.inputTxids = [];
    } else {
      const inputTxids = /* @__PURE__ */ new Set();
      for (const input of this.tx.inputs) {
        if (input.sourceTXID !== void 0 && input.sourceTXID !== null && input.sourceTXID !== "") {
          inputTxids.add(input.sourceTXID);
        }
      }
      this.inputTxids = Array.from(inputTxids);
    }
  }
  toWriter(writer, version) {
    const writeByte = (bb) => {
      writer.writeUInt8(bb);
    };
    const writeTxid = () => {
      if (this._txid == null) {
        throw new Error("Transaction ID (_txid) is undefined");
      }
      writer.writeReverse(toArray2(this._txid, "hex"));
    };
    const writeTx = () => {
      const bytes2 = this.rawTxUint8Array;
      if (bytes2 == null) {
        throw new Error("a valid serialized Transaction is expected");
      }
      writer.write(bytes2);
    };
    const writeBumpIndex = () => {
      if (this.bumpIndex === void 0) {
        writeByte(TX_DATA_FORMAT.RAWTX);
      } else {
        writeByte(TX_DATA_FORMAT.RAWTX_AND_BUMP_INDEX);
        writer.writeVarIntNum(this.bumpIndex);
      }
    };
    if (version === BEEF_V2) {
      if (this.isTxidOnly) {
        writeByte(TX_DATA_FORMAT.TXID_ONLY);
        writeTxid();
      } else if (this.bumpIndex !== void 0) {
        writeByte(TX_DATA_FORMAT.RAWTX_AND_BUMP_INDEX);
        writer.writeVarIntNum(this.bumpIndex);
        writeTx();
      } else {
        writeByte(TX_DATA_FORMAT.RAWTX);
        writeTx();
      }
    } else {
      writeTx();
      writeBumpIndex();
    }
  }
  static fromReader(br, version) {
    let data;
    let bumpIndex;
    let beefTx;
    if (version === BEEF_V2) {
      const format = br.readUInt8();
      if (format === TX_DATA_FORMAT.TXID_ONLY) {
        beefTx = _BeefTx.fromTxid(toHex(br.readReverse(32)));
      } else {
        if (format === TX_DATA_FORMAT.RAWTX_AND_BUMP_INDEX) {
          bumpIndex = br.readVarIntNum();
        }
        data = Transaction.fromReader(br);
        beefTx = _BeefTx.fromTx(data, bumpIndex);
      }
    } else {
      data = Transaction.fromReader(br);
      bumpIndex = br.readUInt8() === 0 ? void 0 : br.readVarIntNum();
      beefTx = _BeefTx.fromTx(data, bumpIndex);
    }
    return beefTx;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/transaction/Beef.js
var Beef = class _Beef {
  bumps = [];
  txs = [];
  version = BEEF_V2;
  atomicTxid = void 0;
  txidIndex = void 0;
  rawBytesCache;
  hexCache;
  needsSort = true;
  constructor(version = BEEF_V2) {
    this.version = version;
  }
  invalidateSerializationCaches() {
    this.rawBytesCache = void 0;
    this.hexCache = void 0;
  }
  markMutated(requiresSort = true) {
    this.invalidateSerializationCaches();
    if (requiresSort) {
      this.needsSort = true;
    }
  }
  ensureSerializableState() {
    for (const tx of this.txs) {
      tx.txid;
    }
  }
  ensureSortedForSerialization() {
    if (this.needsSort) {
      this.sortTxs();
    }
  }
  getSerializedBytes() {
    this.ensureSerializableState();
    if (this.rawBytesCache == null) {
      this.ensureSortedForSerialization();
      const writer = new WriterUint8Array();
      this.toWriter(writer);
      this.rawBytesCache = writer.toUint8Array();
    }
    return this.rawBytesCache;
  }
  getBeefForAtomic(txid) {
    if (this.needsSort) {
      this.sortTxs();
    }
    const tx = this.findTxid(txid);
    if (tx == null) {
      throw new Error(`${txid} does not exist in this Beef`);
    }
    const beef = this.txs.at(-1) === tx ? this : this.clone();
    if (beef !== this) {
      const i = this.txs.findIndex((t3) => t3.txid === txid);
      beef.txs.splice(i + 1);
    }
    const writer = new WriterUint8Array();
    writer.writeUInt32LE(ATOMIC_BEEF);
    writer.writeReverse(toArray2(txid, "hex"));
    return { beef, writer };
  }
  /**
   * @param txid of `beefTx` to find
   * @returns `BeefTx` in `txs` with `txid`.
   */
  findTxid(txid) {
    return this.ensureTxidIndex().get(txid);
  }
  ensureTxidIndex() {
    if (this.txidIndex == null) {
      this.txidIndex = /* @__PURE__ */ new Map();
      for (const tx of this.txs) {
        this.txidIndex.set(tx.txid, tx);
      }
    }
    return this.txidIndex;
  }
  deleteFromIndex(txid) {
    this.txidIndex?.delete(txid);
  }
  addToIndex(tx) {
    this.txidIndex?.set(tx.txid, tx);
  }
  /**
   * Replaces `BeefTx` for this txid with txidOnly.
   *
   * Replacement is done so that a `clone()` can be
   * updated by this method without affecting the
   * original.
   *
   * @param txid
   * @returns undefined if txid is unknown.
   */
  makeTxidOnly(txid) {
    const i = this.txs.findIndex((tx) => tx.txid === txid);
    if (i === -1)
      return void 0;
    let btx = this.txs[i];
    if (btx.isTxidOnly) {
      return btx;
    }
    this.deleteFromIndex(txid);
    this.txs.splice(i, 1);
    this.markMutated(true);
    btx = this.mergeTxidOnly(txid);
    return btx;
  }
  /**
   * @returns `MerklePath` with level zero hash equal to txid or undefined.
   */
  findBump(txid) {
    return this.bumps.find((b5) => b5.path[0].some((leaf) => leaf.hash === txid));
  }
  /**
   * Finds a Transaction in this `Beef`
   * and adds any missing input SourceTransactions from this `Beef`.
   *
   * The result is suitable for signing.
   *
   * @param txid The id of the target transaction.
   * @returns Transaction with all available input `SourceTransaction`s from this Beef.
   */
  findTransactionForSigning(txid) {
    const beefTx = this.findTxid(txid);
    if (beefTx == null || beefTx.tx == null)
      return void 0;
    for (const i of beefTx.tx.inputs) {
      if (i.sourceTransaction == null) {
        const itx = this.findTxid(verifyNotNull(i.sourceTXID, "sourceTXID must be valid"));
        if (itx != null) {
          i.sourceTransaction = itx.tx;
        }
      }
    }
    return beefTx.tx;
  }
  /**
   * Builds the proof tree rooted at a specific `Transaction`.
   *
   * To succeed, the Beef must contain all the required transaction and merkle path data.
   *
   * @param txid The id of the target transaction.
   * @returns Transaction with input `SourceTransaction` and `MerklePath` populated from this Beef.
   */
  findAtomicTransaction(txid) {
    const beefTx = this.findTxid(txid);
    if (beefTx == null || beefTx.tx == null)
      return void 0;
    this.addInputProof(beefTx.tx);
    return beefTx.tx;
  }
  /** Recursively attach merkle paths and source transactions to all inputs. */
  addInputProof(tx) {
    const mp = this.findBump(tx.id("hex"));
    if (mp != null) {
      tx.merklePath = mp;
      return;
    }
    for (const i of tx.inputs) {
      this.resolveInputSource(i);
      if (i.sourceTransaction != null) {
        this.attachMerklePathOrRecurse(i.sourceTransaction);
      }
    }
  }
  resolveInputSource(i) {
    if (i.sourceTransaction == null) {
      const itx = this.findTxid(verifyNotNull(i.sourceTXID, "sourceTXID must be valid"));
      if (itx != null) {
        i.sourceTransaction = itx.tx;
      }
    }
  }
  attachMerklePathOrRecurse(sourceTx) {
    const mp = this.findBump(sourceTx.id("hex"));
    if (mp != null) {
      sourceTx.merklePath = mp;
    } else {
      this.addInputProof(sourceTx);
    }
  }
  /**
   * Merge a MerklePath that is assumed to be fully valid.
   * @param bump
   * @returns index of merged bump
   */
  mergeBump(bump) {
    this.markMutated(false);
    const bumpIndex = this.findOrInsertBump(bump);
    const b5 = this.bumps[bumpIndex];
    for (const tx of this.txs) {
      if (tx.bumpIndex == null) {
        this.tryMarkTxProvenByBump(tx, b5, bumpIndex);
      }
    }
    return bumpIndex;
  }
  /**
   * Find an existing compatible bump or insert a new one; return its index.
   */
  findOrInsertBump(bump) {
    for (let i = 0; i < this.bumps.length; i++) {
      const b5 = this.bumps[i];
      if (b5 === bump)
        return i;
      if (b5.blockHeight !== bump.blockHeight)
        continue;
      if (b5.computeRoot() === bump.computeRoot()) {
        b5.combine(bump);
        return i;
      }
    }
    this.bumps.push(bump);
    return this.bumps.length - 1;
  }
  /** If bump's level-0 path contains tx's txid, record the bumpIndex on tx. */
  tryMarkTxProvenByBump(tx, b5, bumpIndex) {
    const txid = tx.txid;
    for (const n2 of b5.path[0]) {
      if (n2.hash === txid) {
        tx.bumpIndex = bumpIndex;
        n2.txid = true;
        break;
      }
    }
  }
  /**
   * Merge a serialized transaction.
   *
   * Checks that a transaction with the same txid hasn't already been merged.
   *
   * Replaces existing transaction with same txid.
   *
   * @param rawTx
   * @param bumpIndex Optional. If a number, must be valid index into bumps array.
   * @returns txid of rawTx
   */
  mergeRawTx(rawTx, bumpIndex) {
    this.markMutated(true);
    const newTx = new BeefTx(rawTx, bumpIndex);
    this.removeExistingTxid(newTx.txid);
    this.txs.push(newTx);
    this.addToIndex(newTx);
    this.tryToValidateBumpIndex(newTx);
    return newTx;
  }
  /**
   * Merge a `Transaction` and any referenced `merklePath` and `sourceTransaction`, recursifely.
   *
   * Replaces existing transaction with same txid.
   *
   * Attempts to match an existing bump to the new transaction.
   *
   * @param tx
   * @returns txid of tx
   */
  mergeTransaction(tx) {
    this.markMutated(true);
    const txid = tx.id("hex");
    this.removeExistingTxid(txid);
    let bumpIndex;
    if (tx.merklePath != null) {
      bumpIndex = this.mergeBump(tx.merklePath);
    }
    const newTx = new BeefTx(tx, bumpIndex);
    this.txs.push(newTx);
    this.addToIndex(newTx);
    this.tryToValidateBumpIndex(newTx);
    bumpIndex = newTx.bumpIndex;
    if (bumpIndex === void 0) {
      for (const input of tx.inputs) {
        if (input.sourceTransaction != null) {
          this.mergeTransaction(input.sourceTransaction);
        }
      }
    }
    return newTx;
  }
  /**
   * Removes an existing transaction from the BEEF, given its TXID
   * @param txid TXID of the transaction to remove
   */
  removeExistingTxid(txid) {
    const existingTxIndex = this.txs.findIndex((t3) => t3.txid === txid);
    if (existingTxIndex >= 0) {
      this.deleteFromIndex(txid);
      this.txs.splice(existingTxIndex, 1);
      this.markMutated(true);
    }
  }
  mergeTxidOnly(txid) {
    let tx = this.findTxid(txid);
    if (tx == null) {
      tx = new BeefTx(txid);
      this.txs.push(tx);
      this.addToIndex(tx);
      this.tryToValidateBumpIndex(tx);
      this.markMutated(true);
    }
    return tx;
  }
  mergeBeefTx(btx) {
    let beefTx = this.findTxid(btx.txid);
    if (btx.isTxidOnly && beefTx == null) {
      beefTx = this.mergeTxidOnly(btx.txid);
    } else if (btx._tx != null && (beefTx == null || beefTx.isTxidOnly)) {
      beefTx = this.mergeTransaction(btx._tx);
    } else if (btx._rawTx != null && (beefTx == null || beefTx.isTxidOnly)) {
      beefTx = this.mergeRawTx(btx._rawTx);
    }
    if (beefTx == null) {
      throw new Error(`Failed to merge BeefTx for txid: ${btx.txid}`);
    }
    return beefTx;
  }
  mergeBeef(beef) {
    const b5 = beef instanceof _Beef ? beef : _Beef.fromBinary(beef);
    for (const bump of b5.bumps) {
      this.mergeBump(bump);
    }
    for (const tx of b5.txs) {
      this.mergeBeefTx(tx);
    }
  }
  /**
   * Sorts `txs` and checks structural validity of beef.
   *
   * Does NOT verify merkle roots.
   *
   * Validity requirements:
   * 1. No 'known' txids, unless `allowTxidOnly` is true.
   * 2. All transactions have bumps or their inputs chain back to bumps (or are known).
   * 3. Order of transactions satisfies dependencies before dependents.
   * 4. No transactions with duplicate txids.
   *
   * @param allowTxidOnly optional. If true, transaction txid only is assumed valid
   */
  isValid(allowTxidOnly) {
    return this.verifyValid(allowTxidOnly).valid;
  }
  /**
   * Sorts `txs` and confirms validity of transaction data contained in beef
   * by validating structure of this beef and confirming computed merkle roots
   * using `chainTracker`.
   *
   * Validity requirements:
   * 1. No 'known' txids, unless `allowTxidOnly` is true.
   * 2. All transactions have bumps or their inputs chain back to bumps (or are known).
   * 3. Order of transactions satisfies dependencies before dependents.
   * 4. No transactions with duplicate txids.
   *
   * @param chainTracker Used to verify computed merkle path roots for all bump txids.
   * @param allowTxidOnly optional. If true, transaction txid is assumed valid
   */
  async verify(chainTracker, allowTxidOnly) {
    const r3 = this.verifyValid(allowTxidOnly);
    if (!r3.valid)
      return false;
    for (const height of Object.keys(r3.roots)) {
      const isValid = await chainTracker.isValidRootForHeight(r3.roots[height], Number(height));
      if (!isValid) {
        return false;
      }
    }
    return true;
  }
  /**
   * Sorts `txs` and confirms validity of transaction data contained in beef
   * by validating structure of this beef.
   *
   * Returns block heights and merkle root values to be confirmed by a chaintracker.
   *
   * Validity requirements:
   * 1. No 'known' txids, unless `allowTxidOnly` is true.
   * 2. All transactions have bumps or their inputs chain back to bumps (or are known).
   * 3. Order of transactions satisfies dependencies before dependents.
   * 4. No transactions with duplicate txids.
   *
   * @param allowTxidOnly optional. If true, transaction txid is assumed valid
   * @returns {{valid: boolean, roots: Record<number, string>}}
   * `valid` is true iff this Beef is structuraly valid.
   * `roots` is a record where keys are block heights and values are the corresponding merkle roots to be validated.
   */
  verifyValid(allowTxidOnly) {
    const r3 = {
      valid: false,
      roots: {}
    };
    const sr = this.sortTxs();
    if (sr.missingInputs.length > 0 || sr.notValid.length > 0 || sr.txidOnly.length > 0 && allowTxidOnly !== true || sr.withMissingInputs.length > 0) {
      return r3;
    }
    const txids = {};
    if (!this.collectTxidOnlyTxids(txids, allowTxidOnly))
      return r3;
    if (!this.collectBumpTxids(txids, r3))
      return r3;
    if (!this.verifyBumpIndexLeaves())
      return r3;
    if (!this.verifyInputDependencies(txids))
      return r3;
    r3.valid = true;
    return r3;
  }
  /** Add txidOnly transaction txids; return false if not allowed. */
  collectTxidOnlyTxids(txids, allowTxidOnly) {
    for (const tx of this.txs) {
      if (!tx.isTxidOnly)
        continue;
      if (allowTxidOnly !== true)
        return false;
      txids[tx.txid] = true;
    }
    return true;
  }
  /**
   * Record txids proven by bumps; validate all bump roots agree per block height.
   * Returns false if any root conflict is detected.
   */
  collectBumpTxids(txids, r3) {
    for (const b5 of this.bumps) {
      for (const n2 of b5.path[0]) {
        if (n2.txid !== true || typeof n2.hash !== "string" || n2.hash.length === 0)
          continue;
        txids[n2.hash] = true;
        if (!this.confirmComputedRoot(b5, n2.hash, r3))
          return false;
      }
    }
    return true;
  }
  /** Verify that every tx with a bumpIndex has a matching txid leaf in its bump. */
  verifyBumpIndexLeaves() {
    for (const t3 of this.txs) {
      if (t3.bumpIndex === void 0)
        continue;
      const leaf = this.bumps[t3.bumpIndex].path[0].find((l6) => l6.hash === t3.txid);
      if (leaf == null)
        return false;
    }
    return true;
  }
  /** Verify all input txids appear before the spending tx in sorted order. */
  verifyInputDependencies(txids) {
    for (const t3 of this.txs) {
      for (const i of t3.inputTxids) {
        if (!txids[i])
          return false;
      }
      txids[t3.txid] = true;
    }
    return true;
  }
  /** Confirm the computed merkle root for txid in bump matches previously accepted root for that height. */
  confirmComputedRoot(b5, txid, r3) {
    const root = b5.computeRoot(txid);
    if (r3.roots[b5.blockHeight] === void 0 || r3.roots[b5.blockHeight] === "") {
      r3.roots[b5.blockHeight] = root;
    }
    return r3.roots[b5.blockHeight] === root;
  }
  /**
   * Serializes this data to `writer`
   * @param writer
   */
  toWriter(writer) {
    writer.writeUInt32LE(this.version);
    writer.writeVarIntNum(this.bumps.length);
    for (const b5 of this.bumps) {
      writer.write(b5.toBinary());
    }
    writer.writeVarIntNum(this.txs.length);
    for (const tx of this.txs) {
      tx.toWriter(writer, this.version);
    }
  }
  /**
   * Returns a binary array representing the serialized BEEF
   * @returns A binary array representing the BEEF
   * @returns An array of byte values containing binary serialization of the BEEF
   */
  toBinary() {
    return Array.from(this.getSerializedBytes());
  }
  /**
   * Returns a binary array representing the serialized BEEF
   * @returns A Uint8Array containing binary serialization of the BEEF
   */
  toUint8Array() {
    return this.getSerializedBytes();
  }
  /**
   * Serialize this Beef as AtomicBEEF.
   *
   * `txid` must exist
   *
   * after sorting, if txid is not last txid, creates a clone and removes newer txs
   *
   * @param txid
   * @returns serialized contents of this Beef with AtomicBEEF prefix.
   */
  toBinaryAtomic(txid) {
    const { beef, writer } = this.getBeefForAtomic(txid);
    beef.toWriter(writer);
    return writer.toArray();
  }
  /**
   * Serialize this Beef as AtomicBEEF.
   *
   * `txid` must exist
   *
   * after sorting, if txid is not last txid, creates a clone and removes newer txs
   *
   * @param txid
   * @returns serialized contents of this Beef with AtomicBEEF prefix.
   */
  toUint8ArrayAtomic(txid) {
    const { beef, writer } = this.getBeefForAtomic(txid);
    const beefUint8 = beef.getSerializedBytes();
    const prefix2 = writer.toUint8Array();
    const atomic = new Uint8Array(prefix2.length + beefUint8.length);
    atomic.set(prefix2, 0);
    atomic.set(beefUint8, prefix2.length);
    return atomic;
  }
  /**
   * Returns a hex string representing the serialized BEEF
   * @returns A hex string representing the BEEF
   */
  toHex() {
    if (this.hexCache != null) {
      return this.hexCache;
    }
    const bytes2 = this.getSerializedBytes();
    const hex = toHex(bytes2);
    this.hexCache = hex;
    return hex;
  }
  static fromReader(br) {
    let version = br.readUInt32LE();
    let atomicTxid;
    if (version === ATOMIC_BEEF) {
      atomicTxid = toHex(br.readReverse(32));
      version = br.readUInt32LE();
    }
    if (version !== BEEF_V1 && version !== BEEF_V2) {
      throw new Error(`Serialized BEEF must start with ${BEEF_V1} or ${BEEF_V2} but starts with ${version}`);
    }
    const beef = new _Beef(version);
    const bumpsLength = br.readVarIntNum();
    for (let i = 0; i < bumpsLength; i++) {
      const bump = MerklePath.fromReader(br, false);
      beef.bumps.push(bump);
    }
    const txsLength = br.readVarIntNum();
    for (let i = 0; i < txsLength; i++) {
      const beefTx = BeefTx.fromReader(br, version);
      beef.txs.push(beefTx);
    }
    beef.atomicTxid = atomicTxid;
    return beef;
  }
  /**
   * Constructs an instance of the Beef class based on the provided binary array
   * @param bin The binary array or Uint8Array from which to construct BEEF
   * @returns An instance of the Beef class constructed from the binary data
   */
  static fromBinary(bin) {
    const br = ReaderUint8Array.makeReader(bin);
    return _Beef.fromReader(br);
  }
  /**
   * Constructs an instance of the Beef class based on the provided string
   * @param s The string value from which to construct BEEF
   * @param enc The encoding of the string value from which BEEF should be constructed
   * @returns An instance of the Beef class constructed from the string
   */
  static fromString(s4, enc = "hex") {
    const bin = toUint8Array(s4, enc);
    const br = new ReaderUint8Array(bin);
    return _Beef.fromReader(br);
  }
  /**
   * Try to validate newTx.bumpIndex by looking for an existing bump
   * that proves newTx.txid
   *
   * @param newTx A new `BeefTx` that has been added to this.txs
   * @returns true if a bump was found, false otherwise
   */
  tryToValidateBumpIndex(newTx) {
    if (newTx.bumpIndex !== void 0) {
      return true;
    }
    const txid = newTx.txid;
    for (let i = 0; i < this.bumps.length; i++) {
      const j2 = this.bumps[i].path[0].findIndex((b5) => b5.hash === txid);
      if (j2 >= 0) {
        newTx.bumpIndex = i;
        this.bumps[i].path[0][j2].txid = true;
        return true;
      }
    }
    return false;
  }
  /**
   * Sort the `txs` by input txid dependency order:
   * - Oldest Tx Anchored by Path or txid only
   * - Newer Txs depending on Older parents
   * - Newest Tx
   *
   * with proof (MerklePath) last, longest chain of dependencies first
   *
   * @returns `{ missingInputs, notValid, valid, withMissingInputs }`
   */
  sortTxs() {
    const validTxids = {};
    const txidToTx = {};
    const result = [];
    const txidOnly = [];
    let queue = this.partitionTxs(txidToTx, validTxids, result, txidOnly);
    const { txsMissingInputs, missingInputs, remaining } = this.separateMissingInputs(queue, txidToTx);
    queue = remaining;
    const txsNotValid = this.topoSort(queue, validTxids, result);
    this.txs = txsMissingInputs.concat(txsNotValid).concat(txidOnly).concat(result);
    this.needsSort = false;
    this.invalidateSerializationCaches();
    return {
      missingInputs: Object.keys(missingInputs),
      notValid: txsNotValid.map((tx) => tx.txid),
      valid: Object.keys(validTxids),
      withMissingInputs: txsMissingInputs.map((tx) => tx.txid),
      txidOnly: txidOnly.map((tx) => tx.txid)
    };
  }
  /**
   * Partition txs into proven (result), txidOnly, and a queue of the rest.
   * Populates txidToTx and validTxids as side-effects.
   */
  partitionTxs(txidToTx, validTxids, result, txidOnly) {
    const queue = [];
    for (const tx of this.txs) {
      txidToTx[tx.txid] = tx;
      tx.isValid = tx.hasProof;
      if (tx.isValid) {
        validTxids[tx.txid] = true;
        result.push(tx);
      } else if (tx.isTxidOnly && tx.inputTxids.length === 0) {
        validTxids[tx.txid] = true;
        txidOnly.push(tx);
      } else {
        queue.push(tx);
      }
    }
    return queue;
  }
  /**
   * Separate queue entries that have at least one input txid not present in txidToTx.
   */
  separateMissingInputs(candidates, txidToTx) {
    const missingInputs = {};
    const txsMissingInputs = [];
    const remaining = [];
    for (const tx of candidates) {
      let hasMissingInput = false;
      for (const inputTxid of tx.inputTxids) {
        if (txidToTx[inputTxid] === void 0) {
          missingInputs[inputTxid] = true;
          hasMissingInput = true;
        }
      }
      if (hasMissingInput) {
        txsMissingInputs.push(tx);
      } else {
        remaining.push(tx);
      }
    }
    return { txsMissingInputs, missingInputs, remaining };
  }
  /**
   * Topologically sort queue into result; return anything that cannot be sorted.
   */
  topoSort(queue, validTxids, result) {
    while (queue.length > 0) {
      const oldQueue = queue;
      queue = [];
      for (const tx of oldQueue) {
        if (tx.inputTxids.every((txid) => validTxids[txid])) {
          validTxids[tx.txid] = true;
          result.push(tx);
        } else {
          queue.push(tx);
        }
      }
      if (oldQueue.length === queue.length)
        break;
    }
    return queue;
  }
  /**
   * @returns a shallow copy of this beef
   */
  clone() {
    const c4 = new _Beef();
    c4.version = this.version;
    c4.bumps = Array.from(this.bumps);
    c4.txs = Array.from(this.txs);
    c4.txidIndex = void 0;
    c4.needsSort = this.needsSort;
    c4.hexCache = this.hexCache;
    c4.rawBytesCache = this.rawBytesCache;
    return c4;
  }
  /**
   * Ensure that all the txids in `knownTxids` are txidOnly
   * @param knownTxids
   */
  trimKnownTxids(knownTxids) {
    let mutated = this.removeKnownTxidOnlyTxs(knownTxids);
    mutated = this.reindexBumps() || mutated;
    if (mutated) {
      this.markMutated(true);
    }
  }
  /** Remove txidOnly entries that appear in knownTxids; return true if any were removed. */
  removeKnownTxidOnlyTxs(knownTxids) {
    let mutated = false;
    for (let i = 0; i < this.txs.length; ) {
      const tx = this.txs[i];
      if (tx.isTxidOnly && knownTxids.includes(tx.txid)) {
        this.deleteFromIndex(tx.txid);
        this.txs.splice(i, 1);
        mutated = true;
      } else {
        i++;
      }
    }
    return mutated;
  }
  /**
   * Remove bumps that are no longer referenced by any tx and update bumpIndex references.
   * Returns true if any bumps were removed.
   */
  reindexBumps() {
    const referencedBumpIndices = /* @__PURE__ */ new Set();
    for (const tx of this.txs) {
      if (tx.bumpIndex !== void 0) {
        referencedBumpIndices.add(tx.bumpIndex);
      }
    }
    if (referencedBumpIndices.size >= this.bumps.length)
      return false;
    const indexMap = /* @__PURE__ */ new Map();
    let newIndex = 0;
    for (let i = 0; i < this.bumps.length; i++) {
      if (referencedBumpIndices.has(i)) {
        indexMap.set(i, newIndex);
        newIndex++;
      }
    }
    this.bumps = this.bumps.filter((_3, i) => referencedBumpIndices.has(i));
    for (const tx of this.txs) {
      if (tx.bumpIndex === void 0)
        continue;
      const mapped = indexMap.get(tx.bumpIndex);
      if (mapped === void 0) {
        throw new Error(`Internal error: bumpIndex ${tx.bumpIndex} not found in indexMap`);
      }
      tx.bumpIndex = mapped;
    }
    return true;
  }
  /**
   * @returns array of transaction txids that either have a proof or whose inputs chain back to a proven transaction.
   */
  getValidTxids() {
    const r3 = this.sortTxs();
    return r3.valid;
  }
  /**
   * @returns Summary of `Beef` contents as multi-line string.
   */
  toLogString() {
    let log = "";
    log += `BEEF with ${this.bumps.length} BUMPS and ${this.txs.length} Transactions, isValid ${this.isValid().toString()}
`;
    let i = -1;
    for (const b5 of this.bumps) {
      i++;
      log += `  BUMP ${i}
    block: ${b5.blockHeight}
    txids: [
${b5.path[0].filter((n2) => n2.txid === true).map((n2) => `      '${n2.hash ?? ""}'`).join(",\n")}
    ]
`;
    }
    i = -1;
    for (const t3 of this.txs) {
      i++;
      log += `  TX ${i}
    txid: ${t3.txid}
`;
      if (t3.bumpIndex !== void 0) {
        log += `    bumpIndex: ${t3.bumpIndex}
`;
      }
      if (t3.isTxidOnly) {
        log += "    txidOnly\n";
      } else {
        log += `    rawTx length=${t3.rawTx?.length ?? 0}
`;
      }
      if (t3.inputTxids.length > 0) {
        log += `    inputs: [
${t3.inputTxids.map((it) => `      '${it}'`).join(",\n")}
    ]
`;
      }
    }
    return log;
  }
  /**
  * In some circumstances it may be helpful for the BUMP MerklePaths to include
  * leaves that can be computed from row zero.
  */
  addComputedLeaves() {
    for (const bump of this.bumps) {
      for (let row = 1; row < bump.path.length; row++) {
        this.addComputedLeavesForRow(bump, row);
      }
    }
  }
  /** Add any missing computable leaf at `row` derived from two known leaves at `row - 1`. */
  addComputedLeavesForRow(bump, row) {
    const hashPair = (m4) => toHex(hash256(toArray2(m4, "hex").reverse()).reverse());
    for (const leafL of bump.path[row - 1]) {
      if (typeof leafL.hash !== "string" || (leafL.offset & 1) !== 0)
        continue;
      const leafR = bump.path[row - 1].find((l6) => l6.offset === leafL.offset + 1);
      if (leafR === void 0 || typeof leafR.hash !== "string")
        continue;
      const offsetOnRow = leafL.offset >> 1;
      if (bump.path[row].every((l6) => l6.offset !== offsetOnRow)) {
        bump.path[row].push({
          offset: offsetOnRow,
          // String concatenation puts the right leaf on the left of the left leaf hash
          hash: hashPair(leafR.hash + leafL.hash)
        });
      }
    }
  }
};

// node_modules/@bsv/sdk/dist/esm/src/transaction/Transaction.js
var POST_CHRONICLE_HEIGHT_FALLBACK = 943816;
var Transaction = class _Transaction {
  version;
  inputs;
  outputs;
  lockTime;
  metadata;
  merklePath;
  cachedHash;
  rawBytesCache;
  hexCache;
  // Recursive function for adding merkle proofs or input transactions
  static addPathOrInputs(obj, transactions, BUMPs) {
    if (typeof obj.pathIndex === "number") {
      const path = BUMPs[obj.pathIndex];
      if (typeof path !== "object") {
        throw new TypeError("Invalid merkle path index found in BEEF!");
      }
      obj.tx.merklePath = path;
    } else {
      for (const input of obj.tx.inputs) {
        if (input.sourceTXID === void 0) {
          throw new Error("Input sourceTXID is undefined");
        }
        const sourceObj = transactions[input.sourceTXID];
        if (typeof sourceObj !== "object") {
          throw new TypeError(`Reference to unknown TXID in BEEF: ${input.sourceTXID ?? "undefined"}`);
        }
        input.sourceTransaction = sourceObj.tx;
        this.addPathOrInputs(sourceObj, transactions, BUMPs);
      }
    }
  }
  /**
   * Creates a new transaction, linked to its inputs and their associated merkle paths, from a BEEF V1, V2 or Atomic.
   * Optionally, you can provide a specific TXID to retrieve a particular transaction from the BEEF data.
   * If the TXID is provided but not found in the BEEF data, an error will be thrown.
   * If no TXID is provided, the last transaction in the BEEF data is returned, or the atomic txid.
   * @param beef A binary representation of transactions in BEEF format.
   * @param txid Optional TXID of the transaction to retrieve from the BEEF data.
   * @returns An anchored transaction, linked to its associated inputs populated with merkle paths.
   */
  static fromBEEF(beef, txid) {
    const { tx } = _Transaction.fromAnyBeef(beef, txid);
    return tx;
  }
  /**
   * Creates a new transaction from an Atomic BEEF (BRC-95) structure.
   * Extracts the subject transaction and supporting merkle path and source transactions contained in the BEEF data
   *
   * @param beef A binary representation of an Atomic BEEF structure.
   * @returns The subject transaction, linked to its associated inputs populated with merkle paths.
   */
  static fromAtomicBEEF(beef) {
    const { tx, txid, beef: b5 } = _Transaction.fromAnyBeef(beef);
    if (txid !== b5.atomicTxid) {
      if (b5.atomicTxid == null) {
        throw new Error("beef must conform to BRC-95 and must contain the subject txid.");
      } else {
        throw new Error(`Transaction with TXID ${b5.atomicTxid} not found in BEEF data.`);
      }
    }
    return tx;
  }
  static fromAnyBeef(beef, txid) {
    const b5 = Beef.fromBinary(beef);
    if (b5.txs.length < 1) {
      throw new Error("beef must include at least one transaction.");
    }
    const lastTx = b5.txs.at(-1);
    if (lastTx == null) {
      throw new Error("beef must include at least one transaction.");
    }
    const target = txid ?? b5.atomicTxid ?? lastTx.txid;
    const tx = b5.findAtomicTransaction(target);
    if (tx == null) {
      if (txid == null) {
        throw new Error("beef does not contain transaction for atomic txid.");
      } else {
        throw new Error(`Transaction with TXID ${String(target)} not found in BEEF data.`);
      }
    }
    return { tx, beef: b5, txid: target };
  }
  /**
   * Creates a new transaction, linked to its inputs and their associated merkle paths, from a EF (BRC-30) structure.
   * @param ef A binary representation of a transaction in EF format.
   * @returns An extended transaction, linked to its associated inputs by locking script and satoshis amounts only.
   */
  static fromEF(ef) {
    const br = ReaderUint8Array.makeReader(ef);
    const version = br.readUInt32LE();
    if (toHex(br.read(6)) !== "0000000000ef") {
      throw new Error("Invalid EF marker");
    }
    const inputsLength = br.readVarIntNum();
    const inputs = [];
    for (let i = 0; i < inputsLength; i++) {
      const sourceTXID = toHex(br.readReverse(32));
      const sourceOutputIndex = br.readUInt32LE();
      const scriptLength = br.readVarIntNum();
      const scriptBin = br.read(scriptLength);
      const unlockingScript = UnlockingScript.fromBinary(scriptBin);
      const sequence = br.readUInt32LE();
      const satoshis = br.readUInt64LEBn().toNumber();
      const lockingScriptLength = br.readVarIntNum();
      const lockingScriptBin = br.read(lockingScriptLength);
      const lockingScript = LockingScript.fromBinary(lockingScriptBin);
      const sourceTransaction = new _Transaction(void 0, [], [], void 0);
      sourceTransaction.outputs = new Array(sourceOutputIndex + 1).fill(null);
      sourceTransaction.outputs[sourceOutputIndex] = {
        satoshis,
        lockingScript
      };
      inputs.push({
        sourceTransaction,
        sourceTXID,
        sourceOutputIndex,
        unlockingScript,
        sequence
      });
    }
    const outputsLength = br.readVarIntNum();
    const outputs = [];
    for (let i = 0; i < outputsLength; i++) {
      const satoshis = br.readUInt64LEBn().toNumber();
      const scriptLength = br.readVarIntNum();
      const scriptBin = br.read(scriptLength);
      const lockingScript = LockingScript.fromBinary(scriptBin);
      outputs.push({
        satoshis,
        lockingScript
      });
    }
    const lockTime = br.readUInt32LE();
    return new _Transaction(version, inputs, outputs, lockTime);
  }
  /**
   * Since the validation of blockchain data is atomically transaction data validation,
   * any application seeking to validate data in output scripts must store the entire transaction as well.
   * Since the transaction data includes the output script data, saving a second copy of potentially
   * large scripts can bloat application storage requirements.
   *
   * This function efficiently parses binary transaction data to determine the offsets and lengths of each script.
   * This supports the efficient retreival of script data from transaction data.
   *
   * @param bin binary transaction data
   * @returns {
   *   inputs: { vin: number, offset: number, length: number }[]
   *   outputs: { vout: number, offset: number, length: number }[]
   * }
   */
  static parseScriptOffsets(bin) {
    const br = ReaderUint8Array.makeReader(bin);
    const inputs = [];
    const outputs = [];
    br.pos += 4;
    const inputsLength = br.readVarIntNum();
    for (let i = 0; i < inputsLength; i++) {
      br.pos += 36;
      const scriptLength = br.readVarIntNum();
      inputs.push({ vin: i, offset: br.pos, length: scriptLength });
      br.pos += scriptLength + 4;
    }
    const outputsLength = br.readVarIntNum();
    for (let i = 0; i < outputsLength; i++) {
      br.pos += 8;
      const scriptLength = br.readVarIntNum();
      outputs.push({ vout: i, offset: br.pos, length: scriptLength });
      br.pos += scriptLength;
    }
    return { inputs, outputs };
  }
  static fromReader(br) {
    const version = br.readUInt32LE();
    const inputsLength = br.readVarIntNum();
    const inputs = [];
    for (let i = 0; i < inputsLength; i++) {
      const sourceTXID = toHex(br.readReverse(32));
      const sourceOutputIndex = br.readUInt32LE();
      const scriptLength = br.readVarIntNum();
      const scriptBin = br.read(scriptLength);
      const unlockingScript = UnlockingScript.fromBinary(scriptBin);
      const sequence = br.readUInt32LE();
      inputs.push({
        sourceTXID,
        sourceOutputIndex,
        unlockingScript,
        sequence
      });
    }
    const outputsLength = br.readVarIntNum();
    const outputs = [];
    for (let i = 0; i < outputsLength; i++) {
      const satoshis = br.readUInt64LEBn().toNumber();
      const scriptLength = br.readVarIntNum();
      const scriptBin = br.read(scriptLength);
      const lockingScript = LockingScript.fromBinary(scriptBin);
      outputs.push({
        satoshis,
        lockingScript
      });
    }
    const lockTime = br.readUInt32LE();
    return new _Transaction(version, inputs, outputs, lockTime);
  }
  /**
   * Creates a Transaction instance from a binary array.
   *
   * @static
   * @param {number[]} bin - The binary array representation of the transaction.
   * @returns {Transaction} - A new Transaction instance.
   */
  static fromBinary(bin) {
    const copy = bin.slice();
    const rawBytes = Uint8Array.from(copy);
    const br = new ReaderUint8Array(rawBytes);
    const tx = _Transaction.fromReader(br);
    tx.rawBytesCache = rawBytes;
    return tx;
  }
  /**
   * Creates a Transaction instance from a hexadecimal string.
   *
   * @static
   * @param {string} hex - The hexadecimal string representation of the transaction.
   * @returns {Transaction} - A new Transaction instance.
   */
  static fromHex(hex) {
    const rawBytes = toUint8Array(hex, "hex");
    const br = new ReaderUint8Array(rawBytes);
    const tx = _Transaction.fromReader(br);
    tx.rawBytesCache = rawBytes;
    tx.hexCache = toHex(rawBytes);
    return tx;
  }
  /**
   * Creates a Transaction instance from a hexadecimal string encoded EF.
   *
   * @static
   * @param {string} hex - The hexadecimal string representation of the transaction EF.
   * @returns {Transaction} - A new Transaction instance.
   */
  static fromHexEF(hex) {
    return _Transaction.fromEF(toUint8Array(hex, "hex"));
  }
  /**
   * Creates a Transaction instance from a hexadecimal string encoded BEEF.
   * Optionally, you can provide a specific TXID to retrieve a particular transaction from the BEEF data.
   * If the TXID is provided but not found in the BEEF data, an error will be thrown.
   * If no TXID is provided, the last transaction in the BEEF data is returned.
   *
   * @static
   * @param {string} hex - The hexadecimal string representation of the transaction BEEF.
   * @param {string} [txid] - Optional TXID of the transaction to retrieve from the BEEF data.
   * @returns {Transaction} - A new Transaction instance.
   */
  static fromHexBEEF(hex, txid) {
    return _Transaction.fromBEEF(toArray2(hex, "hex"), txid);
  }
  constructor(version = 1, inputs = [], outputs = [], lockTime = 0, metadata = /* @__PURE__ */ new Map(), merklePath) {
    this.version = version;
    this.inputs = inputs;
    this.outputs = outputs;
    this.lockTime = lockTime;
    this.metadata = metadata;
    this.merklePath = merklePath;
  }
  invalidateSerializationCaches() {
    this.cachedHash = void 0;
    this.rawBytesCache = void 0;
    this.hexCache = void 0;
  }
  /**
   * Adds a new input to the transaction.
   *
   * @param {TransactionInput} input - The TransactionInput object to add to the transaction.
   * @throws {Error} - If the input does not have a sourceTXID or sourceTransaction defined.
   */
  addInput(input) {
    if (input.sourceTXID === void 0 && input.sourceTransaction === void 0) {
      throw new TypeError("A reference to an an input transaction is required. If the input transaction itself cannot be referenced, its TXID must still be provided.");
    }
    input.sequence ??= 4294967295;
    this.invalidateSerializationCaches();
    this.inputs.push(input);
  }
  /**
   * Adds a new output to the transaction.
   *
   * @param {TransactionOutput} output - The TransactionOutput object to add to the transaction.
   */
  addOutput(output) {
    this.cachedHash = void 0;
    if (output.change !== true) {
      if (output.satoshis === void 0) {
        throw new TypeError("either satoshis must be defined or change must be set to true");
      }
      if (output.satoshis < 0) {
        throw new Error("satoshis must be a positive integer or zero");
      }
    }
    if (output.lockingScript == null)
      throw new Error("lockingScript must be defined");
    this.outputs.push(output);
  }
  /**
   * Adds a new P2PKH output to the transaction.
   *
   * @param {number[] | string} address - The P2PKH address of the output.
   * @param {number} [satoshis] - The number of satoshis to send to the address - if not provided, the output is considered a change output.
   *
   */
  addP2PKHOutput(address, satoshis) {
    const lockingScript = new P2PKH().lock(address);
    if (satoshis === void 0) {
      return this.addOutput({ lockingScript, change: true });
    }
    this.addOutput({
      lockingScript,
      satoshis
    });
  }
  /**
   * Updates the transaction's metadata.
   *
   * @param {Record<string, any>} metadata - The metadata object to merge into the existing metadata.
   */
  updateMetadata(metadata) {
    this.metadata = {
      ...this.metadata,
      ...metadata
    };
  }
  /**
   * Computes fees prior to signing.
   * If no fee model is provided, uses a LivePolicy fee model that fetches current rates from ARC.
   * If fee is a number, the transaction uses that value as fee.
   *
   * @param modelOrFee - The initialized fee model to use or fixed fee for the transaction
   * @param changeDistribution - Specifies how the change should be distributed
   * amongst the change outputs
   *
   */
  async fee(modelOrFee = LivePolicy.getInstance(), changeDistribution = "equal") {
    this.invalidateSerializationCaches();
    if (typeof modelOrFee === "number") {
      const sats = modelOrFee;
      modelOrFee = {
        computeFee: async () => sats
      };
    }
    const fee = await modelOrFee.computeFee(this);
    const change = this.calculateChange(fee);
    if (change <= 0) {
      this.outputs = this.outputs.filter((output) => output.change !== true);
      return;
    }
    this.distributeChange(change, changeDistribution);
  }
  calculateChange(fee) {
    let change = 0;
    for (const input of this.inputs) {
      if (typeof input.sourceTransaction !== "object") {
        throw new TypeError("Source transactions are required for all inputs during fee computation");
      }
      change += input.sourceTransaction.outputs[input.sourceOutputIndex].satoshis ?? 0;
    }
    change -= fee;
    for (const out of this.outputs) {
      if (out.change !== true) {
        if (out.satoshis !== void 0) {
          change -= out.satoshis;
        }
      }
    }
    return change;
  }
  distributeChange(change, changeDistribution) {
    let distributedChange = 0;
    const changeOutputs = this.outputs.filter((out) => out.change);
    if (changeDistribution === "random") {
      distributedChange = this.distributeRandomChange(change, changeOutputs);
    } else if (changeDistribution === "equal") {
      distributedChange = this.distributeEqualChange(change, changeOutputs);
    }
    if (distributedChange < change) {
      const lastOutput = this.outputs.at(-1);
      if (lastOutput.satoshis === void 0) {
        lastOutput.satoshis = change - distributedChange;
      } else {
        lastOutput.satoshis += change - distributedChange;
      }
    }
  }
  distributeRandomChange(change, changeOutputs) {
    let distributedChange = 0;
    let changeToUse = change;
    const benfordNumbers = new Array(changeOutputs.length).fill(1);
    changeToUse -= changeOutputs.length;
    distributedChange += changeOutputs.length;
    for (let i = 0; i < changeOutputs.length - 1; i++) {
      const portion = this.benfordNumber(0, changeToUse);
      benfordNumbers[i] = benfordNumbers[i] + portion;
      distributedChange += portion;
      changeToUse -= portion;
    }
    for (const output of this.outputs) {
      if (output.change === true)
        output.satoshis = benfordNumbers.shift();
    }
    return distributedChange;
  }
  distributeEqualChange(change, changeOutputs) {
    let distributedChange = 0;
    const perOutput = Math.floor(change / changeOutputs.length);
    for (const out of changeOutputs) {
      distributedChange += perOutput;
      out.satoshis = perOutput;
    }
    return distributedChange;
  }
  benfordNumber(min, max) {
    const d5 = Random_default(1)[0] % 9 + 1;
    return Math.floor(min + (max - min) * Math.log10(1 + 1 / d5) / Math.log10(10));
  }
  /**
   * Utility method that returns the current fee based on inputs and outputs
   *
   * @returns The current transaction fee
   */
  getFee() {
    let totalIn = 0;
    for (const input of this.inputs) {
      if (typeof input.sourceTransaction !== "object") {
        throw new TypeError("Source transactions or sourceSatoshis are required for all inputs to calculate fee");
      }
      totalIn += input.sourceTransaction.outputs[input.sourceOutputIndex].satoshis ?? 0;
    }
    let totalOut = 0;
    for (const output of this.outputs) {
      totalOut += output.satoshis ?? 0;
    }
    return totalIn - totalOut;
  }
  /**
   * Signs a transaction, hydrating all its unlocking scripts based on the provided script templates where they are available.
   */
  async sign() {
    this.invalidateSerializationCaches();
    for (const out of this.outputs) {
      if (out.satoshis === void 0) {
        if (out.change === true) {
          throw new Error("There are still change outputs with uncomputed amounts. Use the fee() method to compute the change amounts and transaction fees prior to signing.");
        } else {
          throw new Error("One or more transaction outputs is missing an amount. Ensure all output amounts are provided before signing.");
        }
      }
    }
    const unlockingScripts = await Promise.all(this.inputs.map(async (x5, i) => {
      if (typeof this.inputs[i].unlockingScriptTemplate === "object") {
        return await this.inputs[i]?.unlockingScriptTemplate?.sign(this, i);
      } else {
        return await Promise.resolve(void 0);
      }
    }));
    for (let i = 0, l6 = this.inputs.length; i < l6; i++) {
      if (typeof this.inputs[i].unlockingScriptTemplate === "object") {
        this.inputs[i].unlockingScript = unlockingScripts[i];
      }
    }
  }
  /**
   * Broadcasts a transaction.
   *
   * @param broadcaster The Broadcaster instance wwhere the transaction will be sent
   * @returns A BroadcastResponse or BroadcastFailure from the Broadcaster
   */
  async broadcast(broadcaster = defaultBroadcaster()) {
    return await broadcaster.broadcast(this);
  }
  writeTransactionBody(writer) {
    writer.writeUInt32LE(this.version);
    writer.writeVarIntNum(this.inputs.length);
    for (const i of this.inputs) {
      if (i.sourceTXID === void 0) {
        if (i.sourceTransaction == null) {
          throw new Error("sourceTransaction is undefined");
        } else {
          writer.write(i.sourceTransaction.hash());
        }
      } else {
        writer.writeReverse(toArray2(i.sourceTXID, "hex"));
      }
      writer.writeUInt32LE(i.sourceOutputIndex);
      if (i.unlockingScript == null) {
        throw new Error("unlockingScript is undefined");
      }
      const scriptBin = i.unlockingScript.toUint8Array();
      writer.writeVarIntNum(scriptBin.length);
      writer.write(scriptBin);
      writer.writeUInt32LE(i.sequence ?? 4294967295);
    }
    writer.writeVarIntNum(this.outputs.length);
    for (const o5 of this.outputs) {
      writer.writeUInt64LE(o5.satoshis ?? 0);
      const scriptBin = o5.lockingScript.toUint8Array();
      writer.writeVarIntNum(scriptBin.length);
      writer.write(scriptBin);
    }
    writer.writeUInt32LE(this.lockTime);
  }
  buildSerializedBytes() {
    const writer = new WriterUint8Array();
    this.writeTransactionBody(writer);
    return writer.toUint8Array();
  }
  getSerializedBytes() {
    this.rawBytesCache ??= this.buildSerializedBytes();
    return this.rawBytesCache;
  }
  /**
   * Converts the transaction to a binary array format.
   *
   * @returns {number[]} - The binary array representation of the transaction.
   */
  toBinary() {
    return Array.from(this.getSerializedBytes());
  }
  toUint8Array() {
    return this.getSerializedBytes();
  }
  writeEF(writer) {
    writer.writeUInt32LE(this.version);
    writer.write([0, 0, 0, 0, 0, 239]);
    writer.writeVarIntNum(this.inputs.length);
    for (const i of this.inputs) {
      if (i.sourceTransaction === void 0) {
        throw new TypeError("All inputs must have source transactions when serializing to EF format");
      }
      if (i.sourceTXID === void 0) {
        writer.write(i.sourceTransaction.hash());
      } else {
        writer.write(toArray2(i.sourceTXID, "hex").reverse());
      }
      writer.writeUInt32LE(i.sourceOutputIndex);
      if (i.unlockingScript == null) {
        throw new Error("unlockingScript is undefined");
      }
      const scriptBin = i.unlockingScript.toBinary();
      writer.writeVarIntNum(scriptBin.length);
      writer.write(scriptBin);
      writer.writeUInt32LE(i.sequence ?? 4294967295);
      writer.writeUInt64LE(i.sourceTransaction.outputs[i.sourceOutputIndex].satoshis ?? 0);
      const lockingScriptBin = i.sourceTransaction.outputs[i.sourceOutputIndex].lockingScript.toBinary();
      writer.writeVarIntNum(lockingScriptBin.length);
      writer.write(lockingScriptBin);
    }
    writer.writeVarIntNum(this.outputs.length);
    for (const o5 of this.outputs) {
      writer.writeUInt64LE(o5.satoshis ?? 0);
      const scriptBin = o5.lockingScript.toBinary();
      writer.writeVarIntNum(scriptBin.length);
      writer.write(scriptBin);
    }
    writer.writeUInt32LE(this.lockTime);
  }
  /**
   * Converts the transaction to a BRC-30 EF format.
   *
   * @returns {number[]} - The BRC-30 EF representation of the transaction.
   */
  toEF() {
    const writer = new Writer();
    this.writeEF(writer);
    return writer.toArray();
  }
  /**
   * Converts the transaction to a BRC-30 EF format.
   *
   * @returns {Uint8Array} - The BRC-30 EF representation of the transaction.
   */
  toEFUint8Array() {
    const writer = new WriterUint8Array();
    this.writeEF(writer);
    return writer.toUint8Array();
  }
  /**
   * Converts the transaction to a hexadecimal string EF.
   *
   * @returns {string} - The hexadecimal string representation of the transaction EF.
   */
  toHexEF() {
    return toHex(this.toEFUint8Array());
  }
  /**
   * Converts the transaction to a hexadecimal string format.
   *
   * @returns {string} - The hexadecimal string representation of the transaction.
   */
  toHex() {
    if (this.hexCache != null) {
      return this.hexCache;
    }
    const bytes2 = this.getSerializedBytes();
    const hex = toHex(bytes2);
    this.hexCache = hex;
    return hex;
  }
  /**
   * Converts the transaction to a hexadecimal string BEEF.
   *
   * @returns {string} - The hexadecimal string representation of the transaction BEEF.
   */
  toHexBEEF() {
    return toHex(this.toBEEF());
  }
  /**
   * Converts the transaction to a hexadecimal string Atomic BEEF.
   *
   * @returns {string} - The hexadecimal string representation of the transaction Atomic BEEF.
   */
  toHexAtomicBEEF() {
    return toHex(this.toAtomicBEEF());
  }
  /**
   * Calculates the transaction's hash.
   *
   * @param {'hex' | undefined} enc - The encoding to use for the hash. If 'hex', returns a hexadecimal string; otherwise returns a binary array.
   * @returns {string | number[]} - The hash of the transaction in the specified format.
   */
  hash(enc) {
    this.cachedHash ??= hash256(this.getSerializedBytes());
    if (enc === "hex") {
      return toHex(this.cachedHash);
    }
    return this.cachedHash;
  }
  /**
   * Calculates the transaction's ID.
   *
   * @param {'hex' | undefined} enc - The encoding to use for the ID. If 'hex', returns a hexadecimal string; otherwise returns a binary array.
   * @returns {string | number[]} - The ID of the transaction in the specified format.
   */
  id(enc) {
    const id = [...this.hash()];
    id.reverse();
    if (enc === "hex") {
      return toHex(id);
    }
    return id;
  }
  /**
   * Verifies the legitimacy of the Bitcoin transaction according to the rules of SPV by ensuring all the input transactions link back to valid block headers, the chain of spends for all inputs are valid, and the sum of inputs is not less than the sum of outputs.
   *
   * @param chainTracker - An instance of ChainTracker, a Bitcoin block header tracker. If the value is set to 'scripts only', headers will not be verified. If not provided then the default chain tracker will be used.
   * @param feeModel - An instance of FeeModel, a fee model to use for fee calculation. If not provided then the default fee model will be used.
   * @param memoryLimit - The maximum memory in bytes usage allowed for script evaluation. If not provided then the default memory limit will be used.
   *
   * @returns Whether the transaction is valid according to the rules of SPV.
   *
   * @example tx.verify(new WhatsOnChain(), LivePolicy.getInstance())
   */
  async verify(chainTracker = defaultChainTracker(), feeModel, memoryLimit, verifier) {
    const verifiedTxids = /* @__PURE__ */ new Set();
    const txQueue = [this];
    while (txQueue.length > 0) {
      const tx = txQueue.shift();
      const txid = tx?.id("hex") ?? "";
      if (txid != null && txid !== "" && verifiedTxids.has(txid)) {
        continue;
      }
      if (typeof tx?.merklePath === "object") {
        if (chainTracker === "scripts only") {
          if (txid != null) {
            verifiedTxids.add(txid);
          }
          continue;
        } else {
          const proofValid = await tx.merklePath.verify(txid, chainTracker);
          if (proofValid) {
            verifiedTxids.add(txid);
            continue;
          } else {
            throw new Error(`Invalid merkle path for transaction ${txid}`);
          }
        }
      }
      if (feeModel !== void 0) {
        if (tx === void 0) {
          throw new Error("Transaction is undefined");
        }
        const cpTx = _Transaction.fromEF(tx.toEF());
        delete cpTx.outputs[0].satoshis;
        cpTx.outputs[0].change = true;
        await cpTx.fee(feeModel);
        if (tx.getFee() < cpTx.getFee()) {
          throw new Error(`Verification failed because the transaction ${txid} has an insufficient fee and has not been mined.`);
        }
      }
      let inputTotal = 0;
      if (tx === void 0) {
        throw new Error("Transaction is undefined");
      }
      for (let i = 0; i < tx.inputs.length; i++) {
        const input = tx.inputs[i];
        if (typeof input.sourceTransaction !== "object") {
          throw new TypeError(`Verification failed because the input at index ${i} of transaction ${txid} is missing an associated source transaction. This source transaction is required for transaction verification because there is no merkle proof for the transaction spending a UTXO it contains.`);
        }
        if (typeof input.unlockingScript !== "object") {
          throw new TypeError(`Verification failed because the input at index ${i} of transaction ${txid} is missing an associated unlocking script. This script is required for transaction verification because there is no merkle proof for the transaction spending the UTXO.`);
        }
        const sourceOutput = input.sourceTransaction.outputs[input.sourceOutputIndex];
        inputTotal += sourceOutput.satoshis ?? 0;
        const sourceTxid = input.sourceTransaction.id("hex");
        if (!verifiedTxids.has(sourceTxid)) {
          txQueue.push(input.sourceTransaction);
        }
        const otherInputs = tx.inputs.filter((_3, idx) => idx !== i);
        input.sourceTXID ??= sourceTxid;
        if (verifier === void 0) {
          const spend = new Spend({
            sourceTXID: input.sourceTXID,
            sourceOutputIndex: input.sourceOutputIndex,
            lockingScript: sourceOutput.lockingScript,
            sourceSatoshis: sourceOutput.satoshis ?? 0,
            transactionVersion: tx.version,
            otherInputs,
            unlockingScript: input.unlockingScript,
            inputSequence: input.sequence ?? 4294967295,
            // default to max sequence
            inputIndex: i,
            outputs: tx.outputs,
            lockTime: tx.lockTime,
            memoryLimit
          });
          const spendValid = spend.validate();
          if (!spendValid) {
            return false;
          }
        }
      }
      if (verifier !== void 0) {
        const scriptsValid = await verifier.verifyScripts({
          tx,
          blockHeight: POST_CHRONICLE_HEIGHT_FALLBACK,
          consensus: true
        });
        if (!scriptsValid) {
          return false;
        }
      }
      let outputTotal = 0;
      for (const out of tx.outputs) {
        if (typeof out.satoshis !== "number") {
          throw new TypeError("Every output must have a defined amount during transaction verification.");
        }
        outputTotal += out.satoshis;
      }
      if (outputTotal > inputTotal) {
        return false;
      }
      verifiedTxids.add(txid);
    }
    return true;
  }
  /**
   * Serializes this transaction, together with its inputs and the respective merkle proofs, into the BEEF (BRC-62) format. This enables efficient verification of its compliance with the rules of SPV.
   *
   * @param writer The writer to serialize to
   * @param allowPartial If true, error will not be thrown if there are any missing sourceTransactions.
   *
   * @returns The serialized BEEF structure
   * @throws Error if there are any missing sourceTransactions unless `allowPartial` is true.
   */
  writeSerializedBEEF(writer, allowPartial) {
    writer.writeUInt32LE(BEEF_V1);
    const BUMPs = [];
    const bumpIndexByInstance = /* @__PURE__ */ new Map();
    const bumpIndexByRoot = /* @__PURE__ */ new Map();
    const txs = [];
    const seenTxids = /* @__PURE__ */ new Set();
    const getBumpIndex = (merklePath) => {
      const existingByInstance = bumpIndexByInstance.get(merklePath);
      if (existingByInstance !== void 0) {
        return existingByInstance;
      }
      const key = `${merklePath.blockHeight}:${merklePath.computeRoot()}`;
      const existingByRoot = bumpIndexByRoot.get(key);
      if (existingByRoot !== void 0) {
        BUMPs[existingByRoot].combine(merklePath);
        bumpIndexByInstance.set(merklePath, existingByRoot);
        return existingByRoot;
      }
      const newIndex = BUMPs.length;
      BUMPs.push(merklePath);
      bumpIndexByInstance.set(merklePath, newIndex);
      bumpIndexByRoot.set(key, newIndex);
      return newIndex;
    };
    const addPathsAndInputs = (tx) => {
      const txid = tx.id("hex");
      if (seenTxids.has(txid)) {
        return;
      }
      const obj = { tx };
      const merklePath = tx.merklePath;
      const hasProof = typeof merklePath === "object";
      if (hasProof && merklePath != null) {
        obj.pathIndex = getBumpIndex(merklePath);
      }
      if (!hasProof) {
        for (let i = tx.inputs.length - 1; i >= 0; i--) {
          const input = tx.inputs[i];
          if (typeof input.sourceTransaction === "object") {
            addPathsAndInputs(input.sourceTransaction);
          } else if (allowPartial === false) {
            throw new Error("A required source transaction is missing!");
          }
        }
      }
      seenTxids.add(txid);
      txs.push(obj);
    };
    addPathsAndInputs(this);
    writer.writeVarIntNum(BUMPs.length);
    for (const b5 of BUMPs) {
      writer.write(b5.toBinary());
    }
    writer.writeVarIntNum(txs.length);
    for (const t3 of txs) {
      writer.write(t3.tx.toBinary());
      if (typeof t3.pathIndex === "number") {
        writer.writeUInt8(1);
        writer.writeVarIntNum(t3.pathIndex);
      } else {
        writer.writeUInt8(0);
      }
    }
    return writer.toArray();
  }
  /**
   * Serializes this transaction, together with its inputs and the respective merkle proofs, into the BEEF (BRC-62) format. This enables efficient verification of its compliance with the rules of SPV.
   *
   * @param allowPartial If true, error will not be thrown if there are any missing sourceTransactions.
   *
   * @returns {number[]} The serialized BEEF structure
   * @throws Error if there are any missing sourceTransactions unless `allowPartial` is true.
   */
  toBEEF(allowPartial) {
    const writer = new Writer();
    this.writeSerializedBEEF(writer, allowPartial);
    return writer.toArray();
  }
  /**
   * Serializes this transaction, together with its inputs and the respective merkle proofs, into the BEEF (BRC-62) format. This enables efficient verification of its compliance with the rules of SPV.
   *
   * @param allowPartial If true, error will not be thrown if there are any missing sourceTransactions.
   *
   * @returns {number[]} The serialized BEEF structure
   * @throws Error if there are any missing sourceTransactions unless `allowPartial` is true.
   */
  toBEEFUint8Array(allowPartial) {
    const writer = new WriterUint8Array();
    this.writeSerializedBEEF(writer, allowPartial);
    return writer.toArray();
  }
  /**
   * Serializes this transaction and its inputs into the Atomic BEEF (BRC-95) format.
   * The Atomic BEEF format starts with a 4-byte prefix `0x01010101`, followed by the TXID of the subject transaction,
   * and then the BEEF data containing only the subject transaction and its dependencies.
   * This format ensures that the BEEF structure is atomic and contains no unrelated transactions.
   *
   * @param allowPartial If true, error will not be thrown if there are any missing sourceTransactions.
   *
   * @returns {number[]} - The serialized Atomic BEEF structure.
   * @throws Error if there are any missing sourceTransactions unless `allowPartial` is true.
   */
  toAtomicBEEF(allowPartial) {
    const prefix2 = [1, 1, 1, 1];
    const txHash = this.hash();
    const beefData = this.toBEEF(allowPartial);
    return prefix2.concat(txHash, beefData);
  }
  /**
   * Serializes this transaction and its inputs into the Atomic BEEF (BRC-95) format.
   * The Atomic BEEF format starts with a 4-byte prefix `0x01010101`, followed by the TXID of the subject transaction,
   * and then the BEEF data containing only the subject transaction and its dependencies.
   * This format ensures that the BEEF structure is atomic and contains no unrelated transactions.
   *
   * @param allowPartial If true, error will not be thrown if there are any missing sourceTransactions.
   *
   * @returns {number[]} - The serialized Atomic BEEF structure.
   * @throws Error if there are any missing sourceTransactions unless `allowPartial` is true.
   */
  toAtomicBEEFUint8Array(allowPartial) {
    const writer = new WriterUint8Array();
    const prefix2 = [1, 1, 1, 1];
    writer.write(prefix2);
    const txHash = this.hash();
    writer.write(txHash);
    this.writeSerializedBEEF(writer, allowPartial);
    return writer.toUint8Array();
  }
  /**
   * Completes the transaction using a wallet interface, which will handle
   * signing and transaction finalization. This method converts the current
   * transaction into a format that can be processed by the wallet, and then
   * updates this transaction object with the result from the wallet.
   *
   * @param {WalletInterface} wallet - The BRC-100 compliant wallet to use for completing the transaction
   * @param {string} [actionDescription] - Optional description for the action
   * @param {string} [originator] - Optional originator domain name
   * @param {CreateActionOptions} [options] - Optional settings for transaction creation (e.g., acceptDelayedBroadcast, trustSelf, noSend, etc.)
   * @returns {Promise<void>}
   */
  async completeWithWallet(wallet, actionDescription, originator, options) {
    const inputCount = this.inputs.length;
    const outputCount = this.outputs.length;
    const description = actionDescription ?? `Transaction with ${inputCount} input(s) and ${outputCount} output(s)`;
    const actionArgs = {
      description,
      inputs: [],
      outputs: [],
      lockTime: this.lockTime,
      version: this.version
    };
    const hasTemplates = this.inputs.some((input) => input.unlockingScriptTemplate != null);
    const beefData = new Beef();
    for (let i = 0; i < this.inputs.length; i++) {
      const input = this.inputs[i];
      if (input.sourceTransaction == null) {
        throw new Error("All inputs must have a sourceTransaction when using completeWithWallet");
      }
      const sourceBEEF = input.sourceTransaction.toBEEF();
      beefData.mergeBeef(sourceBEEF);
      const sourceTXID = input.sourceTransaction.id("hex");
      const inputArg = {
        outpoint: `${sourceTXID}.${input.sourceOutputIndex}`,
        inputDescription: "Input from source transaction",
        sequenceNumber: input.sequence
      };
      if (hasTemplates) {
        if (input.unlockingScriptTemplate != null) {
          const estimatedLength = await input.unlockingScriptTemplate.estimateLength(this, i);
          inputArg.unlockingScriptLength = estimatedLength;
        } else if (input.unlockingScript != null) {
          inputArg.unlockingScript = input.unlockingScript.toHex();
        } else {
          throw new Error(`Input ${i} must have either an unlockingScript or unlockingScriptTemplate`);
        }
      } else {
        if (input.unlockingScript == null) {
          throw new Error("All inputs must have an unlockingScript when using completeWithWallet");
        }
        inputArg.unlockingScript = input.unlockingScript.toHex();
      }
      actionArgs.inputs.push(inputArg);
    }
    if (this.inputs.length > 0) {
      actionArgs.inputBEEF = beefData.toBinary();
    }
    for (const output of this.outputs) {
      actionArgs.outputs.push({
        satoshis: output.satoshis,
        lockingScript: output.lockingScript.toHex(),
        outputDescription: "Output from source transaction"
      });
    }
    if (this.metadata?.labels != null && Array.isArray(this.metadata.labels)) {
      actionArgs.labels = this.metadata.labels;
    }
    let atomicBEEF;
    if (hasTemplates) {
      actionArgs.options = {
        ...options,
        signAndProcess: false
      };
      const { signableTransaction } = await wallet.createAction(actionArgs, originator);
      if (signableTransaction == null) {
        throw new Error("Wallet createAction did not return signableTransaction");
      }
      const partialTx = _Transaction.fromBEEF(signableTransaction.tx);
      const spends = {};
      for (let i = 0; i < this.inputs.length; i++) {
        const input = this.inputs[i];
        if (input.unlockingScriptTemplate != null) {
          const unlockingScript = await input.unlockingScriptTemplate.sign(partialTx, i);
          spends[i] = {
            unlockingScript: unlockingScript.toHex()
          };
        } else if (input.unlockingScript != null) {
          spends[i] = {
            unlockingScript: input.unlockingScript.toHex()
          };
        }
      }
      const signActionOptions = options == null ? void 0 : {
        acceptDelayedBroadcast: options.acceptDelayedBroadcast,
        returnTXIDOnly: options.returnTXIDOnly,
        noSend: options.noSend,
        sendWith: options.sendWith
      };
      const signResult = await wallet.signAction({
        reference: signableTransaction.reference,
        spends,
        options: signActionOptions
      }, originator);
      if (signResult.tx == null) {
        throw new Error("Wallet signAction did not return transaction data");
      }
      atomicBEEF = signResult.tx;
    } else {
      if (options != null) {
        actionArgs.options = options;
      }
      const { tx } = await wallet.createAction(actionArgs, originator);
      if (tx == null) {
        throw new Error("Wallet createAction did not return transaction data");
      }
      atomicBEEF = tx;
    }
    const newTransaction = _Transaction.fromAtomicBEEF(atomicBEEF);
    this.version = newTransaction.version;
    this.inputs = newTransaction.inputs;
    this.outputs = newTransaction.outputs;
    this.lockTime = newTransaction.lockTime;
    this.merklePath = newTransaction.merklePath;
    this.cachedHash = newTransaction.cachedHash;
    this.metadata = {
      ...this.metadata,
      ...newTransaction.metadata
    };
  }
  /**
   * Returns the formatted preimage of a transaction for the requested input index, signature scope (default SIGHASH_FORKID | SIGHASH_ALL), and optional subscript.
   * @param inputIndex - The index of the input to generate the preimage for
   * @param signatureScope - The signature scope to use for the preimage
   * @param subscript - The subscript to use for the preimage (optional)
   * @returns The formatted preimage
   */
  preimage(inputIndex, signatureScope, subscript) {
    inputIndex ??= 0;
    signatureScope ??= TransactionSignature.SIGHASH_FORKID | TransactionSignature.SIGHASH_ALL;
    if (inputIndex < 0 || inputIndex >= this.inputs.length) {
      throw new Error("Invalid input index");
    }
    const flags = signatureScope & 240;
    if (flags !== 224 && flags !== 192 && flags !== 64) {
      throw new Error("FORKID must be set");
    }
    const coverage = signatureScope & 15;
    if (coverage < 1 || coverage > 3) {
      throw new Error("Invalid signature coverage, must be all, none or single");
    }
    const input = this.inputs[inputIndex];
    if (input.sourceTransaction == null) {
      throw new Error("Source transaction is required");
    }
    const output = input.sourceTransaction.outputs[input.sourceOutputIndex];
    if (output == null) {
      throw new Error(`Source transaction's output at index ${input.sourceOutputIndex} is required`);
    }
    const otherInputs = this.inputs.filter((_3, index) => index !== inputIndex);
    return TransactionSignature.format({
      sourceTXID: input.sourceTXID ?? input.sourceTransaction.id("hex"),
      sourceOutputIndex: input.sourceOutputIndex,
      sourceSatoshis: output.satoshis,
      transactionVersion: this.version,
      otherInputs,
      inputIndex,
      outputs: this.outputs,
      inputSequence: input.sequence ?? 4294967295,
      subscript: subscript ?? output.lockingScript,
      lockTime: this.lockTime,
      scope: signatureScope
    });
  }
};

// node_modules/@bsv/sdk/dist/esm/src/compat/BSM.js
var BSM_exports = {};
__export(BSM_exports, {
  magicHash: () => magicHash,
  sign: () => sign2,
  verify: () => verify2
});
var prefix = "Bitcoin Signed Message:\n";
var magicHash = (messageBuf) => {
  const bw = new Writer();
  bw.writeVarIntNum(prefix.length);
  bw.write(toArray2(prefix, "utf8"));
  bw.writeVarIntNum(messageBuf.length);
  bw.write(messageBuf);
  const buf = bw.toArray();
  const hashBuf = hash256(buf);
  return hashBuf;
};
var sign2 = (message, privateKey, mode = "base64") => {
  const hashBuf = magicHash(message);
  const sig = sign(new BigNumber(hashBuf), privateKey, true);
  if (mode === "raw") {
    return sig;
  }
  const h4 = new BigNumber(hashBuf);
  const r3 = sig.CalculateRecoveryFactor(privateKey.toPublicKey(), h4);
  return sig.toCompact(r3, true, "base64");
};
var verify2 = (message, sig, pubKey) => {
  const hashBuf = magicHash(message);
  return verify(new BigNumber(hashBuf), sig, pubKey);
};

// node_modules/@bsv/sdk/dist/esm/src/compat/ECIES.js
function AES(key) {
  if (this._tables[0][0][0] === 0)
    this._precompute();
  let tmp;
  const sbox = this._tables[0][4];
  const decTable = this._tables[1];
  const keyLen = key.length;
  let rcon = 1;
  if (keyLen !== 4 && keyLen !== 6 && keyLen !== 8) {
    throw new Error("invalid aes key size");
  }
  const encKey = key.slice(0);
  const decKey = [];
  this._key = [encKey, decKey];
  let i;
  for (i = keyLen; i < 4 * keyLen + 28; i++) {
    tmp = encKey[i - 1];
    if (i % keyLen === 0 || keyLen === 8 && i % keyLen === 4) {
      tmp = sbox[tmp >>> 24] << 24 ^ sbox[tmp >> 16 & 255] << 16 ^ sbox[tmp >> 8 & 255] << 8 ^ sbox[tmp & 255];
      if (i % keyLen === 0) {
        tmp = tmp << 8 ^ tmp >>> 24 ^ rcon << 24;
        rcon = rcon << 1 ^ (rcon >> 7) * 283;
      }
    }
    encKey[i] = encKey[i - keyLen] ^ tmp;
  }
  for (let j2 = 0; i > 0; j2++, i--) {
    tmp = encKey[(j2 & 3) === 0 ? i - 4 : i];
    if (i <= 4 || j2 < 4) {
      decKey[j2] = tmp;
    } else {
      decKey[j2] = decTable[0][sbox[tmp >>> 24]] ^ decTable[1][sbox[tmp >> 16 & 255]] ^ decTable[2][sbox[tmp >> 8 & 255]] ^ decTable[3][sbox[tmp & 255]];
    }
  }
}
AES.prototype = {
  /**
   * Encrypt an array of 4 big-endian words.
   * @param {Array} data The plaintext.
   * @return {Array} The ciphertext.
   */
  encrypt: function(data) {
    return this._crypt(data, 0);
  },
  /**
   * Decrypt an array of 4 big-endian words.
   * @param {Array} data The ciphertext.
   * @return {Array} The plaintext.
   */
  decrypt: function(data) {
    return this._crypt(data, 1);
  },
  /**
   * The expanded S-box and inverse S-box tables.  These will be computed
   * on the client so that we don't have to send them down the wire.
   *
   * There are two tables, _tables[0] is for encryption and
   * _tables[1] is for decryption.
   *
   * The first 4 sub-tables are the expanded S-box with MixColumns.  The
   * last (_tables[01][4]) is the S-box itself.
   *
   * @private
   */
  _tables: [
    [
      new Uint32Array(256),
      new Uint32Array(256),
      new Uint32Array(256),
      new Uint32Array(256),
      new Uint32Array(256)
    ],
    [
      new Uint32Array(256),
      new Uint32Array(256),
      new Uint32Array(256),
      new Uint32Array(256),
      new Uint32Array(256)
    ]
  ],
  // Expand the S-box tables.
  _precompute: function() {
    const encTable = this._tables[0];
    const decTable = this._tables[1];
    const sbox = encTable[4];
    const sboxInv = decTable[4];
    let i;
    let x5;
    let xInv;
    const d5 = new Uint8Array(256);
    const th = new Uint8Array(256);
    let x22;
    let x42;
    let x8;
    let s4;
    let tEnc;
    let tDec;
    for (i = 0; i < 256; i++) {
      d5[i] = i << 1 ^ (i >> 7) * 283;
      th[d5[i] ^ i] = i;
    }
    for (x5 = xInv = 0; sbox[x5] === 0; x5 ^= x22 === 0 ? 1 : x22, xInv = th[xInv] === 0 ? 1 : th[xInv]) {
      s4 = xInv ^ xInv << 1 ^ xInv << 2 ^ xInv << 3 ^ xInv << 4;
      s4 = s4 >> 8 ^ s4 & 255 ^ 99;
      sbox[x5] = s4;
      sboxInv[s4] = x5;
      x22 = d5[x5];
      x42 = d5[x22];
      x8 = d5[x42];
      tDec = x8 * 16843009 ^ x42 * 65537 ^ x22 * 257 ^ x5 * 16843008;
      tEnc = d5[s4] * 257 ^ s4 * 16843008;
      for (i = 0; i < 4; i++) {
        encTable[i][x5] = tEnc = tEnc << 24 ^ tEnc >>> 8;
        decTable[i][s4] = tDec = tDec << 24 ^ tDec >>> 8;
      }
    }
  },
  /**
   * Encryption and decryption core.
   * @param {Array} input Four words to be encrypted or decrypted.
   * @param dir The direction, 0 for encrypt and 1 for decrypt.
   * @return {Array} The four encrypted or decrypted words.
   * @private
   */
  _crypt: function(input, dir) {
    if (input.length !== 4) {
      throw new Error("invalid aes block size");
    }
    const key = this._key[dir];
    let a4 = input[0] ^ key[0];
    let b5 = input[dir === 1 ? 3 : 1] ^ key[1];
    let c4 = input[2] ^ key[2];
    let d5 = input[dir === 1 ? 1 : 3] ^ key[3];
    let a22;
    let b22;
    let c22;
    const nInnerRounds = key.length / 4 - 2;
    let i;
    let kIndex = 4;
    const out = new Uint32Array(4);
    const table = this._tables[dir];
    const t0 = table[0];
    const t1 = table[1];
    const t22 = table[2];
    const t3 = table[3];
    const sbox = table[4];
    for (i = 0; i < nInnerRounds; i++) {
      a22 = t0[a4 >>> 24] ^ t1[b5 >> 16 & 255] ^ t22[c4 >> 8 & 255] ^ t3[d5 & 255] ^ key[kIndex];
      b22 = t0[b5 >>> 24] ^ t1[c4 >> 16 & 255] ^ t22[d5 >> 8 & 255] ^ t3[a4 & 255] ^ key[kIndex + 1];
      c22 = t0[c4 >>> 24] ^ t1[d5 >> 16 & 255] ^ t22[a4 >> 8 & 255] ^ t3[b5 & 255] ^ key[kIndex + 2];
      d5 = t0[d5 >>> 24] ^ t1[a4 >> 16 & 255] ^ t22[b5 >> 8 & 255] ^ t3[c4 & 255] ^ key[kIndex + 3];
      kIndex += 4;
      a4 = a22;
      b5 = b22;
      c4 = c22;
    }
    for (i = 0; i < 4; i++) {
      out[dir === 1 ? 3 & -i : i] = sbox[a4 >>> 24] << 24 ^ sbox[b5 >> 16 & 255] << 16 ^ sbox[c4 >> 8 & 255] << 8 ^ sbox[d5 & 255] ^ key[kIndex++];
      a22 = a4;
      a4 = b5;
      b5 = c4;
      c4 = d5;
      d5 = a22;
    }
    return out;
  }
};

// node_modules/@bsv/sdk/dist/esm/src/wallet/Wallet.interfaces.js
var SecurityLevels;
(function(SecurityLevels2) {
  SecurityLevels2[SecurityLevels2["Silent"] = 0] = "Silent";
  SecurityLevels2[SecurityLevels2["App"] = 1] = "App";
  SecurityLevels2[SecurityLevels2["Counterparty"] = 2] = "Counterparty";
})(SecurityLevels || (SecurityLevels = {}));

// node_modules/@bsv/sdk/dist/esm/src/wallet/WalletError.js
var walletErrors;
(function(walletErrors2) {
  walletErrors2[walletErrors2["unknownError"] = 1] = "unknownError";
  walletErrors2[walletErrors2["unsupportedAction"] = 2] = "unsupportedAction";
  walletErrors2[walletErrors2["invalidHmac"] = 3] = "invalidHmac";
  walletErrors2[walletErrors2["invalidSignature"] = 4] = "invalidSignature";
  walletErrors2[walletErrors2["reviewActions"] = 5] = "reviewActions";
  walletErrors2[walletErrors2["invalidParameter"] = 6] = "invalidParameter";
  walletErrors2[walletErrors2["insufficientFunds"] = 7] = "insufficientFunds";
})(walletErrors || (walletErrors = {}));

// node_modules/@bsv/sdk/dist/esm/src/wallet/substrates/WalletWireCalls.js
var calls;
(function(calls2) {
  calls2[calls2["createAction"] = 1] = "createAction";
  calls2[calls2["signAction"] = 2] = "signAction";
  calls2[calls2["abortAction"] = 3] = "abortAction";
  calls2[calls2["listActions"] = 4] = "listActions";
  calls2[calls2["internalizeAction"] = 5] = "internalizeAction";
  calls2[calls2["listOutputs"] = 6] = "listOutputs";
  calls2[calls2["relinquishOutput"] = 7] = "relinquishOutput";
  calls2[calls2["getPublicKey"] = 8] = "getPublicKey";
  calls2[calls2["revealCounterpartyKeyLinkage"] = 9] = "revealCounterpartyKeyLinkage";
  calls2[calls2["revealSpecificKeyLinkage"] = 10] = "revealSpecificKeyLinkage";
  calls2[calls2["encrypt"] = 11] = "encrypt";
  calls2[calls2["decrypt"] = 12] = "decrypt";
  calls2[calls2["createHmac"] = 13] = "createHmac";
  calls2[calls2["verifyHmac"] = 14] = "verifyHmac";
  calls2[calls2["createSignature"] = 15] = "createSignature";
  calls2[calls2["verifySignature"] = 16] = "verifySignature";
  calls2[calls2["acquireCertificate"] = 17] = "acquireCertificate";
  calls2[calls2["listCertificates"] = 18] = "listCertificates";
  calls2[calls2["proveCertificate"] = 19] = "proveCertificate";
  calls2[calls2["relinquishCertificate"] = 20] = "relinquishCertificate";
  calls2[calls2["discoverByIdentityKey"] = 21] = "discoverByIdentityKey";
  calls2[calls2["discoverByAttributes"] = 22] = "discoverByAttributes";
  calls2[calls2["isAuthenticated"] = 23] = "isAuthenticated";
  calls2[calls2["waitForAuthentication"] = 24] = "waitForAuthentication";
  calls2[calls2["getHeight"] = 25] = "getHeight";
  calls2[calls2["getHeaderForHeight"] = 26] = "getHeaderForHeight";
  calls2[calls2["getNetwork"] = 27] = "getNetwork";
  calls2[calls2["getVersion"] = 28] = "getVersion";
})(calls || (calls = {}));

// node_modules/@bsv/sdk/dist/esm/src/auth/Peer.js
var BufferCtor5 = typeof globalThis === "undefined" ? void 0 : globalThis.Buffer;

// node_modules/@bsv/sdk/dist/esm/src/auth/transports/SimplifiedFetchTransport.js
var defaultFetch = typeof globalThis !== "undefined" && typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : fetch;

// node_modules/@bsv/sdk/dist/esm/src/overlay-tools/HostReputationTracker.js
var DEFAULT_LATENCY_MS = 1500;
var LATENCY_SMOOTHING_FACTOR = 0.25;
var BASE_BACKOFF_MS = 1e3;
var MAX_BACKOFF_MS = 6e4;
var FAILURE_PENALTY_MS = 400;
var SUCCESS_BONUS_MS = 30;
var FAILURE_BACKOFF_GRACE = 2;
var STORAGE_KEY = "bsvsdk_overlay_host_reputation_v1";
var HostReputationTracker = class {
  stats;
  store;
  constructor(store) {
    this.stats = /* @__PURE__ */ new Map();
    this.store = store ?? this.getLocalStorageAdapter();
    this.loadFromStorage();
  }
  reset() {
    this.stats.clear();
  }
  recordSuccess(host, latencyMs) {
    const entry = this.getOrCreate(host);
    const now = Date.now();
    const safeLatency = Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : DEFAULT_LATENCY_MS;
    if (entry.avgLatencyMs === null) {
      entry.avgLatencyMs = safeLatency;
    } else {
      entry.avgLatencyMs = (1 - LATENCY_SMOOTHING_FACTOR) * entry.avgLatencyMs + LATENCY_SMOOTHING_FACTOR * safeLatency;
    }
    entry.lastLatencyMs = safeLatency;
    entry.totalSuccesses += 1;
    entry.consecutiveFailures = 0;
    entry.backoffUntil = 0;
    entry.lastUpdatedAt = now;
    entry.lastError = void 0;
    this.saveToStorage();
  }
  recordFailure(host, reason) {
    const entry = this.getOrCreate(host);
    const now = Date.now();
    entry.totalFailures += 1;
    entry.consecutiveFailures += 1;
    let msg;
    if (typeof reason === "string") {
      msg = reason;
    } else if (reason instanceof Error) {
      msg = reason.message;
    } else {
      msg = void 0;
    }
    const immediate = typeof msg === "string" && (msg.includes("ERR_NAME_NOT_RESOLVED") || msg.includes("ENOTFOUND") || msg.includes("getaddrinfo") || msg.includes("Failed to fetch"));
    if (immediate && entry.consecutiveFailures < FAILURE_BACKOFF_GRACE + 1) {
      entry.consecutiveFailures = FAILURE_BACKOFF_GRACE + 1;
    }
    const penaltyLevel = Math.max(entry.consecutiveFailures - FAILURE_BACKOFF_GRACE, 0);
    if (penaltyLevel === 0) {
      entry.backoffUntil = 0;
    } else {
      const backoffDuration = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, penaltyLevel - 1));
      entry.backoffUntil = now + backoffDuration;
    }
    entry.lastUpdatedAt = now;
    if (typeof reason === "string") {
      entry.lastError = reason;
    } else if (reason instanceof Error) {
      entry.lastError = reason.message;
    } else {
      entry.lastError = void 0;
    }
    this.saveToStorage();
  }
  rankHosts(hosts, now = Date.now()) {
    const seen = /* @__PURE__ */ new Map();
    hosts.forEach((host, idx) => {
      if (typeof host !== "string" || host.length === 0)
        return;
      if (!seen.has(host))
        seen.set(host, idx);
    });
    const orderedHosts = Array.from(seen.keys());
    const ranked = orderedHosts.map((host) => {
      const entry = this.getOrCreate(host);
      return {
        ...entry,
        score: this.computeScore(entry, now),
        originalOrder: seen.get(host) ?? 0
      };
    });
    ranked.sort((a4, b5) => {
      const aInBackoff = a4.backoffUntil > now;
      const bInBackoff = b5.backoffUntil > now;
      if (aInBackoff !== bInBackoff)
        return aInBackoff ? 1 : -1;
      if (a4.score !== b5.score)
        return a4.score - b5.score;
      if (a4.totalSuccesses !== b5.totalSuccesses)
        return b5.totalSuccesses - a4.totalSuccesses;
      return a4.originalOrder - b5.originalOrder;
    });
    return ranked.map(({ originalOrder, ...rest }) => rest);
  }
  snapshot(host) {
    const entry = this.stats.get(host);
    return entry == null ? void 0 : { ...entry };
  }
  getStorage() {
    try {
      const g5 = typeof globalThis === "object" ? globalThis : void 0;
      if (g5?.localStorage == null)
        return void 0;
      return g5.localStorage;
    } catch {
      return void 0;
    }
  }
  getLocalStorageAdapter() {
    const s4 = this.getStorage();
    if (s4 == null)
      return void 0;
    return {
      get: (key) => {
        try {
          return s4.getItem(key);
        } catch {
          return null;
        }
      },
      set: (key, value) => {
        try {
          s4.setItem(key, value);
        } catch {
        }
      }
    };
  }
  loadFromStorage() {
    const s4 = this.store;
    if (s4 == null)
      return;
    try {
      const raw = s4.get(STORAGE_KEY);
      if (typeof raw !== "string" || raw.length === 0)
        return;
      const data = JSON.parse(raw);
      if (typeof data !== "object" || data === null)
        return;
      this.stats.clear();
      for (const k4 of Object.keys(data)) {
        const v3 = data[k4];
        if (v3 != null && typeof v3 === "object") {
          const entry = {
            host: String(v3.host ?? k4),
            totalSuccesses: Number(v3.totalSuccesses ?? 0),
            totalFailures: Number(v3.totalFailures ?? 0),
            consecutiveFailures: Number(v3.consecutiveFailures ?? 0),
            avgLatencyMs: v3.avgLatencyMs == null ? null : Number(v3.avgLatencyMs),
            lastLatencyMs: v3.lastLatencyMs == null ? null : Number(v3.lastLatencyMs),
            backoffUntil: Number(v3.backoffUntil ?? 0),
            lastUpdatedAt: Number(v3.lastUpdatedAt ?? 0),
            lastError: typeof v3.lastError === "string" ? v3.lastError : void 0
          };
          this.stats.set(entry.host, entry);
        }
      }
    } catch {
    }
  }
  saveToStorage() {
    const s4 = this.store;
    if (s4 == null)
      return;
    try {
      const obj = {};
      for (const [host, entry] of this.stats.entries()) {
        obj[host] = entry;
      }
      s4.set(STORAGE_KEY, JSON.stringify(obj));
    } catch {
    }
  }
  computeScore(entry, now) {
    const latency = entry.avgLatencyMs ?? DEFAULT_LATENCY_MS;
    const failurePenalty = entry.consecutiveFailures * FAILURE_PENALTY_MS;
    const successBonus = Math.min(entry.totalSuccesses * SUCCESS_BONUS_MS, latency / 2);
    const backoffPenalty = entry.backoffUntil > now ? entry.backoffUntil - now : 0;
    return latency + failurePenalty + backoffPenalty - successBonus;
  }
  getOrCreate(host) {
    let entry = this.stats.get(host);
    if (entry == null) {
      entry = {
        host,
        totalSuccesses: 0,
        totalFailures: 0,
        consecutiveFailures: 0,
        avgLatencyMs: null,
        lastLatencyMs: null,
        backoffUntil: 0,
        lastUpdatedAt: 0
      };
      this.stats.set(host, entry);
    }
    return entry;
  }
};
var globalTracker = new HostReputationTracker();

// node_modules/@bsv/sdk/dist/esm/src/overlay-tools/LookupResolver.js
var defaultFetch2 = typeof globalThis !== "undefined" && typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : fetch;

// src/overlay/client.ts
var responseMessage = (body, fallback) => {
  if (body && typeof body === "object" && "message" in body) {
    const message = body.message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
};
var normalizedOutpoint = (value) => {
  const match = /^([0-9a-f]{64})[._](\d+)$/i.exec(value.trim());
  if (!match) throw new Error("A valid overlay output outpoint is required.");
  const outputIndex = Number(match[2]);
  if (!Number.isSafeInteger(outputIndex)) throw new Error("A valid overlay output index is required.");
  return `${match[1].toLowerCase()}_${outputIndex}`;
};
var AdinalsOverlayClient = class {
  endpoint;
  topic;
  service;
  fetcher;
  constructor(endpoint, options = {}) {
    const normalized = endpoint.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//.test(normalized)) throw new Error("A valid Adinals overlay HTTP endpoint is required.");
    this.endpoint = normalized;
    this.topic = options.topic ?? "tm_adinals";
    this.service = options.service ?? "ls_adinals";
    this.fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }
  async submit(atomicBeef) {
    if (atomicBeef.length === 0) throw new Error("Overlay submission requires verified Atomic BEEF.");
    const response = await this.fetcher(`${this.endpoint}/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-topics": JSON.stringify([this.topic])
      },
      body: Uint8Array.from(atomicBeef)
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(responseMessage(body, `Adinals overlay submission failed: ${response.status}`));
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Adinals overlay returned a malformed STEAK acknowledgment.");
    }
    return body;
  }
  async lookup(query) {
    const response = await this.fetcher(`${this.endpoint}/lookup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ service: this.service, query })
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(responseMessage(body, `Adinals overlay lookup failed: ${response.status}`));
    }
    if (!body || typeof body !== "object" || !Array.isArray(body.outputs)) {
      throw new Error("Adinals overlay returned a malformed lookup formula.");
    }
    return body;
  }
  async hasOutput(outpoint) {
    const normalized = normalizedOutpoint(outpoint);
    const [txid, outputIndexText] = normalized.split("_");
    const outputIndex = Number(outputIndexText);
    const result = await this.lookup({ type: "output", version: 1, origin: normalized });
    return result.outputs.some((candidate) => {
      if (candidate.outputIndex !== outputIndex || !Array.isArray(candidate.beef)) return false;
      try {
        const transaction = Transaction.fromBEEF(candidate.beef);
        return transaction.id("hex") === txid && Boolean(transaction.outputs[outputIndex]);
      } catch {
        return false;
      }
    });
  }
};

// node_modules/@1sat/templates/dist/inscription/inscription.js
var Inscription = class _Inscription {
  /** Inscription file data */
  file;
  /** Optional parent inscription reference */
  parent;
  /** Optional script prefix */
  scriptPrefix;
  /** Optional script suffix */
  scriptSuffix;
  /** Unknown/custom fields (field number -> data) */
  fields;
  /**
   * Creates a new Inscription instance
   *
   * @param file - The inscription file data
   * @param parent - Optional parent inscription reference (32 or 36-byte outpoint)
   * @param scriptPrefix - Optional script prefix (Script or LockingScript)
   * @param scriptSuffix - Optional script suffix (Script or LockingScript)
   * @param fields - Optional map of unknown/custom fields
   */
  constructor(file, parent, scriptPrefix, scriptSuffix, fields) {
    this.file = file;
    this.parent = parent;
    this.scriptPrefix = scriptPrefix;
    this.scriptSuffix = scriptSuffix;
    this.fields = fields;
  }
  /**
   * Creates an inscription locking script following the ordinals protocol format:
   * [ScriptPrefix] OP_0 OP_IF "ord" OP_1 [MIME_TYPE] OP_0 [CONTENT] OP_ENDIF [ScriptSuffix]
   *
   * @returns A locking script containing the inscription data
   */
  lock() {
    const script = new Script();
    if (this.scriptPrefix != null) {
      for (const chunk of this.scriptPrefix.chunks) {
        script.chunks.push(chunk);
      }
    }
    script.writeOpCode(OP_default.OP_0);
    script.writeOpCode(OP_default.OP_IF);
    script.writeBin(utils_exports.toArray("ord", "utf8"));
    script.writeOpCode(OP_default.OP_1);
    script.writeBin(utils_exports.toArray(this.file.type, "utf8"));
    if (this.parent != null && this.parent.length === 36) {
      script.writeOpCode(OP_default.OP_3);
      script.writeBin(Array.from(this.parent));
    }
    script.writeOpCode(OP_default.OP_0);
    script.writeBin(Array.from(this.file.content));
    script.writeOpCode(OP_default.OP_ENDIF);
    if (this.scriptSuffix != null) {
      for (const chunk of this.scriptSuffix.chunks) {
        script.chunks.push(chunk);
      }
    }
    return new LockingScript(script.chunks);
  }
  /**
   * Unlock method is not applicable for inscription scripts.
   * Inscriptions are typically used in outputs that don't require unlocking.
   *
   * @throws Error indicating unlock is not supported
   */
  unlock() {
    throw new Error("Unlock is not supported for inscription scripts");
  }
  /**
   * Verifies that the file hash matches the content
   *
   * @returns true if the hash is valid, false otherwise
   */
  verify() {
    const calculatedHash = Hash_exports.sha256(Array.from(this.file.content));
    return utils_exports.toHex(calculatedHash) === utils_exports.toHex(Array.from(this.file.hash));
  }
  /**
   * Creates a new inscription from content and MIME type
   *
   * @param content - The file content as bytes
   * @param contentType - The MIME type of the content
   * @param options - Optional inscription parameters
   * @returns A new Inscription instance
   */
  static create(content, contentType, options = {}) {
    if (contentType === "" || contentType.length > 255) {
      throw new Error("Content type must be a non-empty string with max 255 characters");
    }
    try {
      utils_exports.toArray(contentType, "utf8");
    } catch {
      throw new Error("Content type must be valid UTF-8");
    }
    if (options.parent != null && options.parent.length !== 36) {
      throw new Error("Parent must be exactly 36 bytes (transaction outpoint)");
    }
    const hash = new Uint8Array(Hash_exports.sha256(Array.from(content)));
    const file = {
      hash,
      size: content.length,
      type: contentType,
      content
    };
    return new _Inscription(file, options.parent, options.scriptPrefix, options.scriptSuffix);
  }
  /**
   * Creates an inscription from text content
   *
   * @param text - The text content
   * @param contentType - Optional MIME type (defaults to "text/plain;charset=utf-8")
   * @param options - Optional inscription parameters
   * @returns A new Inscription instance
   */
  static fromText(text, contentType = "text/plain;charset=utf-8", options = {}) {
    const content = new Uint8Array(utils_exports.toArray(text, "utf8"));
    return _Inscription.create(content, contentType, options);
  }
  /**
   * Creates an inscription from a browser File object
   *
   * @param file - The File object
   * @param options - Optional inscription parameters
   * @returns Promise resolving to a new Inscription instance
   */
  static async fromFile(file, options = {}) {
    const arrayBuffer = await file.arrayBuffer();
    const content = new Uint8Array(arrayBuffer);
    const contentType = file.type !== "" ? file.type : "application/octet-stream";
    return _Inscription.create(content, contentType, options);
  }
  /**
   * Checks if a script contains an inscription
   *
   * @param script - The script to check
   * @returns true if the script contains an inscription pattern
   */
  static isInscription(script) {
    try {
      const chunks = script.chunks;
      for (let i = 0; i < chunks.length - 2; i++) {
        const chunk0 = chunks[i];
        const chunk1 = chunks[i + 1];
        const chunk2 = chunks[i + 2];
        if (chunk0?.op === OP_default.OP_0 && chunk1?.op === OP_default.OP_IF && chunk2?.data != null && chunk2.data.length === 3 && utils_exports.toUTF8(chunk2.data) === "ord") {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }
  /**
   * Decodes an inscription from a script
   *
   * @param script - The script containing inscription data
   * @returns Decoded inscription or null if not found/invalid
   */
  static decode(script) {
    try {
      const chunks = script.chunks;
      let inscriptionStart = -1;
      for (let i = 0; i < chunks.length - 2; i++) {
        const chunk0 = chunks[i];
        const chunk1 = chunks[i + 1];
        const chunk2 = chunks[i + 2];
        if (chunk0?.op === OP_default.OP_0 && chunk1?.op === OP_default.OP_IF && chunk2?.data != null && chunk2.data.length === 3 && utils_exports.toUTF8(chunk2.data) === "ord") {
          inscriptionStart = i;
          break;
        }
      }
      if (inscriptionStart === -1) {
        return null;
      }
      let scriptPrefix;
      if (inscriptionStart > 0) {
        scriptPrefix = new Script();
        for (let i = 0; i < inscriptionStart; i++) {
          scriptPrefix.chunks.push(chunks[i]);
        }
      }
      let pos = inscriptionStart + 3;
      let contentType = "";
      let content = new Uint8Array(0);
      let parent;
      const fields = /* @__PURE__ */ new Map();
      while (pos < chunks.length) {
        if (chunks[pos].op === OP_default.OP_ENDIF) {
          pos++;
          break;
        }
        const fieldChunk = chunks[pos];
        let fieldNum;
        let fieldKey;
        if (fieldChunk.op === OP_default.OP_0) {
          fieldNum = 0;
        } else if (fieldChunk.op !== void 0 && fieldChunk.op > OP_default.OP_PUSHDATA4 && fieldChunk.op <= OP_default.OP_16) {
          fieldNum = fieldChunk.op - 80;
        } else if (fieldChunk.data != null && fieldChunk.data.length === 1) {
          fieldNum = fieldChunk.data[0];
        } else if (fieldChunk.data != null && fieldChunk.data.length > 1) {
          fieldKey = String.fromCharCode(...fieldChunk.data);
        } else {
          pos++;
          continue;
        }
        pos++;
        const dataChunk = chunks[pos];
        if (pos >= chunks.length) {
          break;
        }
        const data = dataChunk?.data != null ? new Uint8Array(dataChunk.data) : new Uint8Array(0);
        pos++;
        if (fieldKey != null) {
          fields.set(fieldKey, data);
        } else if (fieldNum !== void 0) {
          switch (fieldNum) {
            case 0:
              content = data;
              break;
            case 1:
              try {
                contentType = utils_exports.toUTF8(Array.from(data));
              } catch {
                contentType = "";
              }
              break;
            case 3:
              if (data.length === 36) {
                parent = data;
              } else if (data.length === 32) {
                parent = new Uint8Array(36);
                parent.set(data, 0);
              }
              break;
            default:
              fields.set(fieldNum.toString(), data);
          }
        }
      }
      let scriptSuffix;
      if (pos < chunks.length) {
        scriptSuffix = new Script();
        for (let i = pos; i < chunks.length; i++) {
          scriptSuffix.chunks.push(chunks[i]);
        }
      }
      if (content.length === 0) {
        return null;
      }
      const hash = new Uint8Array(Hash_exports.sha256(Array.from(content)));
      const file = {
        hash,
        size: content.length,
        type: contentType,
        content
      };
      return new _Inscription(file, parent, scriptPrefix, scriptSuffix, fields.size > 0 ? fields : void 0);
    } catch {
      return null;
    }
  }
  /**
   * Extracts text content from the inscription if it's a text type
   *
   * @returns The text content or null if not text or invalid UTF-8
   */
  getText() {
    if (!this.file.type.startsWith("text/") && this.file.type !== "application/json") {
      return null;
    }
    try {
      return utils_exports.toUTF8(Array.from(this.file.content));
    } catch {
      return null;
    }
  }
  /**
   * Parses JSON content from the inscription
   *
   * @returns The parsed JSON object or null if not JSON or invalid
   */
  getJSON() {
    const text = this.getText();
    if (text == null)
      return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  /**
   * Gets the raw content as bytes
   *
   * @returns The file content
   */
  getContent() {
    return this.file.content;
  }
  /**
   * Gets content as base64 string
   *
   * @returns Base64 encoded content
   */
  getBase64() {
    return utils_exports.toBase64(Array.from(this.file.content));
  }
  /**
   * Gets content as hex string
   *
   * @returns Hex encoded content
   */
  getHex() {
    return utils_exports.toHex(Array.from(this.file.content));
  }
};

// node_modules/cbor2/lib/constants.js
var f2 = { POS_INT: 0, NEG_INT: 1, BYTE_STRING: 2, UTF8_STRING: 3, ARRAY: 4, MAP: 5, TAG: 6, SIMPLE_FLOAT: 7 };
var T = { DATE_STRING: 0, DATE_EPOCH: 1, POS_BIGINT: 2, NEG_BIGINT: 3, DECIMAL_FRAC: 4, BIGFLOAT: 5, BASE64URL_EXPECTED: 21, BASE64_EXPECTED: 22, BASE16_EXPECTED: 23, CBOR: 24, URI: 32, BASE64URL: 33, BASE64: 34, MIME: 36, DATE_EPOCH_DAYS: 100, SET: 258, JSON: 262, WTF8: 273, SYMBOL: 280, DATE_FULL: 1004, REGEXP: 21066, SELF_DESCRIBED: 55799, INVALID_16: 65535, INVALID_32: 4294967295, INVALID_64: 0xffffffffffffffffn };
var I = { ZERO: 0, ONE: 24, TWO: 25, FOUR: 26, EIGHT: 27, INDEFINITE: 31 };
var o = { FALSE: 20, TRUE: 21, NULL: 22, UNDEFINED: 23 };
var A2 = class {
  static BREAK = /* @__PURE__ */ Symbol.for("github.com/hildjj/cbor2/break");
  static ENCODED = /* @__PURE__ */ Symbol.for("github.com/hildjj/cbor2/cbor-encoded");
  static LENGTH = /* @__PURE__ */ Symbol.for("github.com/hildjj/cbor2/length");
};
var S = { MIN: -(2n ** 63n), MAX: 2n ** 64n - 1n };

// node_modules/cbor2/lib/tag.js
var o2 = class _o {
  static #e = /* @__PURE__ */ new Map();
  tag;
  contents;
  constructor(e2, t3 = void 0) {
    this.tag = e2, this.contents = t3;
  }
  get noChildren() {
    return !!_o.#e.get(this.tag)?.noChildren;
  }
  static registerDecoder(e2, t3, n2) {
    const i = this.#e.get(e2);
    return this.#e.set(e2, t3), i && ("comment" in t3 || (t3.comment = i.comment), "noChildren" in t3 || (t3.noChildren = i.noChildren)), n2 && !t3.comment && (t3.comment = () => `(${n2})`), i;
  }
  static clearDecoder(e2) {
    const t3 = this.#e.get(e2);
    return this.#e.delete(e2), t3;
  }
  static getDecoder(e2) {
    return this.#e.get(e2);
  }
  static getAllDecoders() {
    return new Map(this.#e);
  }
  *[Symbol.iterator]() {
    yield this.contents;
  }
  push(e2) {
    return this.contents = e2, 1;
  }
  decode(e2) {
    const t3 = e2?.tags?.get(this.tag) ?? (e2?.ignoreGlobalTags ? void 0 : _o.#e.get(this.tag));
    return t3 ? t3(this, e2) : this;
  }
  comment(e2, t3) {
    const n2 = e2?.tags?.get(this.tag) ?? (e2?.ignoreGlobalTags ? void 0 : _o.#e.get(this.tag));
    if (n2?.comment) return n2.comment(this, e2, t3);
  }
  toCBOR() {
    return [this.tag, this.contents];
  }
  [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")](e2, t3, n2) {
    return `${this.tag}(${n2(this.contents, t3)})`;
  }
};

// node_modules/cbor2/lib/box.js
function f3(n2) {
  if (n2 != null && typeof n2 == "object") return n2[A2.ENCODED];
}
function s2(n2) {
  if (n2 != null && typeof n2 == "object") return n2[A2.LENGTH];
}
function u(n2, e2) {
  Object.defineProperty(n2, A2.ENCODED, { configurable: true, enumerable: false, value: e2 });
}
function d(n2, e2) {
  const r3 = Object(n2);
  return u(r3, e2), r3;
}

// node_modules/cbor2/lib/utils.js
var g = /* @__PURE__ */ Symbol("CBOR_RANGES");
function c(r3, n2) {
  Object.defineProperty(r3, g, { configurable: false, enumerable: false, writable: false, value: n2 });
}
function f4(r3) {
  return r3[g];
}
function l(r3) {
  return f4(r3) !== void 0;
}
function R2(r3, n2 = 0, t3 = r3.length - 1) {
  const o5 = r3.subarray(n2, t3), a4 = f4(r3);
  if (a4) {
    const s4 = [];
    for (const e2 of a4) if (e2[0] >= n2 && e2[0] + e2[1] <= t3) {
      const i = [...e2];
      i[0] -= n2, s4.push(i);
    }
    s4.length && c(o5, s4);
  }
  return o5;
}
function b(r3) {
  let n2 = Math.ceil(r3.length / 2);
  const t3 = new Uint8Array(n2);
  n2--;
  for (let o5 = r3.length, a4 = o5 - 2; o5 >= 0; o5 = a4, a4 -= 2, n2--) t3[n2] = parseInt(r3.substring(a4, o5), 16);
  return t3;
}
function A3(r3) {
  return r3.reduce((n2, t3) => n2 + t3.toString(16).padStart(2, "0"), "");
}
function d2(r3) {
  const n2 = r3.reduce((e2, i) => e2 + i.length, 0), t3 = r3.some((e2) => l(e2)), o5 = [], a4 = new Uint8Array(n2);
  let s4 = 0;
  for (const e2 of r3) {
    if (!(e2 instanceof Uint8Array)) throw new TypeError(`Invalid array: ${e2}`);
    if (a4.set(e2, s4), t3) {
      const i = e2[g] ?? [[0, e2.length]];
      for (const u3 of i) u3[0] += s4;
      o5.push(...i);
    }
    s4 += e2.length;
  }
  return t3 && c(a4, o5), a4;
}
function y(r3) {
  const n2 = atob(r3);
  return Uint8Array.from(n2, (t3) => t3.codePointAt(0));
}
var p = { "-": "+", _: "/" };
function x(r3) {
  const n2 = r3.replace(/[_-]/g, (t3) => p[t3]);
  return y(n2.padEnd(Math.ceil(n2.length / 4) * 4, "="));
}
function h() {
  const r3 = new Uint8Array(4), n2 = new Uint32Array(r3.buffer);
  return !((n2[0] = 1) & r3[0]);
}
function U(r3) {
  let n2 = "";
  for (const t3 of r3) {
    const o5 = t3.codePointAt(0)?.toString(16).padStart(4, "0");
    n2 && (n2 += ", "), n2 += `U+${o5}`;
  }
  return n2;
}

// node_modules/cbor2/lib/typeEncoderMap.js
var s3 = class {
  #e = /* @__PURE__ */ new Map();
  registerEncoder(e2, t3) {
    const n2 = this.#e.get(e2);
    return this.#e.set(e2, t3), n2;
  }
  get(e2) {
    return this.#e.get(e2);
  }
  delete(e2) {
    return this.#e.delete(e2);
  }
  clear() {
    this.#e.clear();
  }
};

// node_modules/cbor2/lib/sorts.js
function f5(c4, d5) {
  const [u3, a4, n2] = c4, [l6, s4, t3] = d5, r3 = Math.min(n2.length, t3.length);
  for (let o5 = 0; o5 < r3; o5++) {
    const e2 = n2[o5] - t3[o5];
    if (e2 !== 0) return e2;
  }
  return 0;
}

// node_modules/cbor2/lib/writer.js
var e = class _e {
  static defaultOptions = { chunkSize: 4096 };
  #r;
  #i = [];
  #s = null;
  #t = 0;
  #a = 0;
  constructor(t3 = {}) {
    if (this.#r = { ..._e.defaultOptions, ...t3 }, this.#r.chunkSize < 8) throw new RangeError(`Expected size >= 8, got ${this.#r.chunkSize}`);
    this.#n();
  }
  get length() {
    return this.#a;
  }
  read() {
    this.#o();
    const t3 = new Uint8Array(this.#a);
    let i = 0;
    for (const s4 of this.#i) t3.set(s4, i), i += s4.length;
    return this.#n(), t3;
  }
  write(t3) {
    const i = t3.length;
    i > this.#l() ? (this.#o(), i > this.#r.chunkSize ? (this.#i.push(t3), this.#n()) : (this.#n(), this.#i[this.#i.length - 1].set(t3), this.#t = i)) : (this.#i[this.#i.length - 1].set(t3, this.#t), this.#t += i), this.#a += i;
  }
  writeUint8(t3) {
    this.#e(1), this.#s.setUint8(this.#t, t3), this.#h(1);
  }
  writeUint16(t3, i = false) {
    this.#e(2), this.#s.setUint16(this.#t, t3, i), this.#h(2);
  }
  writeUint32(t3, i = false) {
    this.#e(4), this.#s.setUint32(this.#t, t3, i), this.#h(4);
  }
  writeBigUint64(t3, i = false) {
    this.#e(8), this.#s.setBigUint64(this.#t, t3, i), this.#h(8);
  }
  writeInt16(t3, i = false) {
    this.#e(2), this.#s.setInt16(this.#t, t3, i), this.#h(2);
  }
  writeInt32(t3, i = false) {
    this.#e(4), this.#s.setInt32(this.#t, t3, i), this.#h(4);
  }
  writeBigInt64(t3, i = false) {
    this.#e(8), this.#s.setBigInt64(this.#t, t3, i), this.#h(8);
  }
  writeFloat32(t3, i = false) {
    this.#e(4), this.#s.setFloat32(this.#t, t3, i), this.#h(4);
  }
  writeFloat64(t3, i = false) {
    this.#e(8), this.#s.setFloat64(this.#t, t3, i), this.#h(8);
  }
  clear() {
    this.#a = 0, this.#i = [], this.#n();
  }
  #n() {
    const t3 = new Uint8Array(this.#r.chunkSize);
    this.#i.push(t3), this.#t = 0, this.#s = new DataView(t3.buffer, t3.byteOffset, t3.byteLength);
  }
  #o() {
    if (this.#t === 0) {
      this.#i.pop();
      return;
    }
    const t3 = this.#i.length - 1;
    this.#i[t3] = this.#i[t3].subarray(0, this.#t), this.#t = 0, this.#s = null;
  }
  #l() {
    const t3 = this.#i.length - 1;
    return this.#i[t3].length - this.#t;
  }
  #e(t3) {
    this.#l() < t3 && (this.#o(), this.#n());
  }
  #h(t3) {
    this.#t += t3, this.#a += t3;
  }
};

// node_modules/cbor2/lib/float.js
var w = 1n << 15n;
var f6 = 0b11111n << 10n;
var b2 = 1n << 9n;
var d3 = b2 - 1n;
var I2 = b2 | d3;
var g2 = 1n << 31n;
var l2 = 0b11111111n << 23n;
var A4 = 1n << 22n;
var E = A4 - 1n;
var p2 = A4 | E;
var N2 = 1n << 63n;
var a = 0b11111111111n << 52n;
var c2 = 1n << 51n;
var u2 = c2 - 1n;
var F = c2 | u2;
var _ = u2 - (d3 << 42n);
var S2 = u2 - (E << 29n);
var m = { 2: "0b", 8: "0o", 16: "0x" };
var x2 = ((t3) => (t3[t3.NATURAL = -2] = "NATURAL", t3[t3.UNKNOWN = -1] = "UNKNOWN", t3[t3.F16 = 2] = "F16", t3[t3.F32 = 4] = "F32", t3[t3.F64 = 8] = "F64", t3))(x2 || {});
function U2(i, n2, e2, r3) {
  let o5 = "nan'";
  return i.quiet || (o5 += "!"), i.sign === -1 && (o5 += "-"), o5 += r3(Math.abs(i.payload), e2), o5 += "'", o5 += i.encodingIndicator, o5;
}
var O = class extends Number {
  #n;
  #t = -1;
  constructor(n2, e2 = true, r3 = -1) {
    super(NaN);
    const o5 = n2;
    if (typeof n2 == "number") {
      if (!Number.isSafeInteger(n2)) throw new Error(`Invalid NAN payload: ${n2}`);
      n2 = BigInt(n2);
      let t3 = 0n;
      if (n2 < 0 && (t3 = N2, n2 = -n2), n2 >= c2) throw new Error(`Payload too large: ${o5}`);
      const s4 = e2 ? c2 : 0n;
      switch (this.#n = t3 | a | s4 | n2, r3) {
        case -2:
          throw new Error("NAN_SIZE.NATURAL only valid for bigint constructor");
        case -1:
          r3 = this.preferredSize;
          break;
        case 2:
          if (this.#n & _) throw new Error("Invalid size for payload");
          break;
        case 4:
          if (this.#n & S2) throw new Error("Invalid size for payload");
          break;
        case 8:
          break;
        default:
          throw new Error(`Invalid size: ${r3}`);
      }
      this.#t = r3;
    } else if (typeof n2 == "bigint") {
      let t3 = -1;
      if ((n2 & a) === a) this.#n = n2, t3 = 8;
      else if ((n2 & l2) === l2) {
        const s4 = (n2 & g2) << 32n;
        this.#n = s4 | a | (n2 & p2) << 29n, t3 = 4;
      } else if ((n2 & f6) === f6) {
        const s4 = (n2 & w) << 48n;
        this.#n = s4 | a | (n2 & I2) << 42n, t3 = 2;
      } else throw new Error(`Invalid raw NaN value: ${n2}`);
      if (r3 === -1) this.#t = this.preferredSize;
      else if (r3 === -2) this.#t = t3;
      else {
        if (r3 < t3) throw new Error("Invalid bigint NaN size");
        this.#t = r3;
      }
    } else {
      const t3 = new DataView(n2.buffer, n2.byteOffset, n2.byteLength);
      switch (n2.length) {
        case 3: {
          if (n2[0] !== 249) throw new Error("Invalid CBOR encoding for half float");
          const s4 = BigInt(t3.getUint16(1, false));
          if ((s4 & f6) !== f6) throw new Error("Not a NaN");
          const h4 = (s4 & w) << 48n;
          this.#n = h4 | a | (s4 & I2) << 42n, this.#t = 2;
          break;
        }
        case 5: {
          if (n2[0] !== 250) throw new Error("Invalid CBOR encoding for single float");
          const s4 = BigInt(t3.getUint32(1, false));
          if ((s4 & l2) !== l2) throw new Error("Not a NaN");
          const h4 = (s4 & g2) << 32n;
          this.#n = h4 | a | (s4 & p2) << 29n, this.#t = 4;
          break;
        }
        case 9: {
          if (n2[0] !== 251) throw new Error("Invalid CBOR encoding for double float");
          if (this.#n = t3.getBigUint64(1, false), (this.#n & a) !== a) throw new Error("Not a NaN (NaNaN)");
          this.#t = 8;
          break;
        }
        default:
          throw new RangeError(`Invalid NAN size (should be 2, 4, or 8): ${n2.length - 1}`);
      }
    }
    if (!this.payload && !this.quiet) throw new Error("Signalling NaN with zero payload");
  }
  get bytes() {
    const n2 = new ArrayBuffer(this.#t + 1), e2 = new DataView(n2);
    switch (this.#t) {
      case 2: {
        e2.setUint8(0, 249);
        const o5 = (this.#n & N2 ? w : 0n) | f6 | (this.#n & F) >> 42n;
        e2.setUint16(1, Number(o5), false);
        break;
      }
      case 4: {
        e2.setUint8(0, 250);
        const o5 = (this.#n & N2 ? g2 : 0n) | l2 | (this.#n & F) >> 29n;
        e2.setUint32(1, Number(o5), false);
        break;
      }
      case 8:
        e2.setUint8(0, 251), e2.setBigUint64(1, this.#n);
        break;
    }
    return new Uint8Array(n2);
  }
  get quiet() {
    return !!(this.#n & c2);
  }
  get sign() {
    return this.#n & N2 ? -1 : 1;
  }
  get payload() {
    return Number(this.#n & u2) * this.sign;
  }
  get raw() {
    return this.#n;
  }
  get encodingIndicator() {
    switch (this.#t) {
      case 2:
        return "_1";
      case 4:
        return "_2";
    }
    return "_3";
  }
  get size() {
    return this.#t;
  }
  get preferredSize() {
    return (this.#n & _) === 0n ? 2 : (this.#n & S2) === 0n ? 4 : 8;
  }
  get isShortestEncoding() {
    return this.preferredSize === this.#t;
  }
  toCBOR(n2) {
    n2.write(this.bytes);
  }
  toString(n2 = 10) {
    return U2(this, 1, {}, (e2) => (m[n2] ?? "") + e2.toString(n2));
  }
  [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")](n2, e2, r3) {
    return U2(this, n2, e2, r3);
  }
};
function v(i, n2 = 0, e2 = false) {
  const r3 = i[n2] & 128 ? -1 : 1, o5 = (i[n2] & 124) >> 2, t3 = (i[n2] & 3) << 8 | i[n2 + 1];
  if (o5 === 0) {
    if (e2 && t3 !== 0) throw new Error(`Unwanted subnormal: ${r3 * 5960464477539063e-23 * t3}`);
    return r3 * 5960464477539063e-23 * t3;
  } else if (o5 === 31) return t3 ? NaN : r3 * (1 / 0);
  return r3 * 2 ** (o5 - 25) * (1024 + t3);
}
function Z(i) {
  const n2 = new DataView(new ArrayBuffer(4));
  n2.setFloat32(0, i, false);
  const e2 = n2.getUint32(0, false);
  if ((e2 & 8191) !== 0) return null;
  let r3 = e2 >> 16 & 32768;
  const o5 = e2 >> 23 & 255, t3 = e2 & 8388607;
  if (!(o5 === 0 && t3 === 0)) if (o5 >= 113 && o5 <= 142) r3 += (o5 - 112 << 10) + (t3 >> 13);
  else if (o5 >= 103 && o5 < 113) {
    if (t3 & (1 << 126 - o5) - 1) return null;
    r3 += t3 + 8388608 >> 126 - o5;
  } else if (o5 === 255) r3 |= 31744, r3 |= t3 >> 13;
  else return null;
  return r3;
}
function k(i) {
  if (i !== 0) {
    const n2 = new ArrayBuffer(8), e2 = new DataView(n2);
    e2.setFloat64(0, i, false);
    const r3 = e2.getBigUint64(0, false);
    if ((r3 & 0x7ff0000000000000n) === 0n) return r3 & 0x8000000000000000n ? -0 : 0;
  }
  return i;
}
function B2(i) {
  switch (i.length) {
    case 2:
      v(i, 0, true);
      break;
    case 4: {
      const n2 = new DataView(i.buffer, i.byteOffset, i.byteLength), e2 = n2.getUint32(0, false);
      if ((e2 & 2139095040) === 0 && e2 & 8388607) throw new Error(`Unwanted subnormal: ${n2.getFloat32(0, false)}`);
      break;
    }
    case 8: {
      const n2 = new DataView(i.buffer, i.byteOffset, i.byteLength), e2 = n2.getBigUint64(0, false);
      if ((e2 & 0x7ff0000000000000n) === 0n && e2 & 0x000fffffffffffn) throw new Error(`Unwanted subnormal: ${n2.getFloat64(0, false)}`);
      break;
    }
    default:
      throw new TypeError(`Bad input to isSubnormal: ${i}`);
  }
}

// node_modules/@cto.af/wtf8/lib/errors.js
var DecodeError = class extends TypeError {
  code = "ERR_ENCODING_INVALID_ENCODED_DATA";
  constructor() {
    super("The encoded data was not valid for encoding wtf-8");
  }
};
var InvalidEncodingError = class extends RangeError {
  code = "ERR_ENCODING_NOT_SUPPORTED";
  constructor(label) {
    super(`Invalid encoding: "${label}"`);
  }
};

// node_modules/@cto.af/wtf8/lib/const.js
var BOM = 65279;
var EMPTY = new Uint8Array(0);
var MIN_HIGH_SURROGATE = 55296;
var MIN_LOW_SURROGATE = 56320;
var REPLACEMENT = 65533;
var WTF8 = "wtf-8";

// node_modules/@cto.af/wtf8/lib/decode.js
function isArrayBufferView(input) {
  return input && typeof input === "object" && !(input instanceof ArrayBuffer) && !(input instanceof SharedArrayBuffer) && input.buffer instanceof ArrayBuffer;
}
function getUint8(input) {
  if (!input) {
    return EMPTY;
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  if (isArrayBufferView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return new Uint8Array(input);
}
var REMAINDER = [
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  -1,
  -1,
  -1,
  1,
  1,
  2,
  3
];
var Wtf8Decoder = class _Wtf8Decoder {
  static DEFAULT_BUFFERSIZE = 4096;
  encoding = WTF8;
  fatal;
  ignoreBOM;
  bufferSize;
  #left = 0;
  #cur = 0;
  #pending = 0;
  #first = true;
  #buf;
  constructor(label = "wtf8", options = void 0) {
    if (label.toLowerCase().replace("-", "") !== "wtf8") {
      throw new InvalidEncodingError(label);
    }
    this.fatal = Boolean(options?.fatal);
    this.ignoreBOM = Boolean(options?.ignoreBOM);
    this.bufferSize = Math.floor(options?.bufferSize ?? _Wtf8Decoder.DEFAULT_BUFFERSIZE);
    if (isNaN(this.bufferSize) || this.bufferSize < 1) {
      throw new RangeError(`Invalid buffer size: ${options?.bufferSize}`);
    }
    this.#buf = new Uint16Array(this.bufferSize);
  }
  decode(input, options) {
    const streaming = Boolean(options?.stream);
    const bytes2 = getUint8(input);
    const res = [];
    const out = this.#buf;
    const maxSize = this.bufferSize - 3;
    let pos = 0;
    const fatal = () => {
      this.#cur = 0;
      this.#left = 0;
      this.#pending = 0;
      if (this.fatal) {
        throw new DecodeError();
      }
      out[pos++] = REPLACEMENT;
    };
    const fatals = () => {
      const p5 = this.#pending;
      for (let i = 0; i < p5; i++) {
        fatal();
      }
    };
    const oneByte = (b5) => {
      if (this.#left === 0) {
        const n2 = REMAINDER[b5 >> 4];
        switch (n2) {
          case -1:
            fatal();
            break;
          case 0:
            out[pos++] = b5;
            break;
          case 1:
            this.#cur = b5 & 31;
            if ((this.#cur & 30) === 0) {
              fatal();
            } else {
              this.#left = 1;
              this.#pending = 1;
            }
            break;
          case 2:
            this.#cur = b5 & 15;
            this.#left = 2;
            this.#pending = 1;
            break;
          case 3:
            if (b5 & 8) {
              fatal();
            } else {
              this.#cur = b5 & 7;
              this.#left = 3;
              this.#pending = 1;
            }
            break;
        }
      } else {
        if ((b5 & 192) !== 128) {
          fatals();
          return oneByte(b5);
        }
        if (this.#pending === 1 && this.#left === 2 && this.#cur === 0 && (b5 & 32) === 0) {
          fatals();
          return oneByte(b5);
        }
        if (this.#left === 3 && this.#cur === 0 && (b5 & 48) === 0) {
          fatals();
          return oneByte(b5);
        }
        this.#cur = this.#cur << 6 | b5 & 63;
        this.#pending++;
        if (--this.#left === 0) {
          if (this.ignoreBOM || !this.#first || this.#cur !== BOM) {
            if (this.#cur < 65536) {
              out[pos++] = this.#cur;
            } else {
              const cp = this.#cur - 65536;
              out[pos++] = cp >>> 10 & 1023 | MIN_HIGH_SURROGATE;
              out[pos++] = cp & 1023 | MIN_LOW_SURROGATE;
            }
          }
          this.#cur = 0;
          this.#pending = 0;
          this.#first = false;
        }
      }
    };
    for (const b5 of bytes2) {
      if (pos >= maxSize) {
        res.push(String.fromCharCode.apply(null, out.subarray(0, pos)));
        pos = 0;
      }
      oneByte(b5);
    }
    if (!streaming) {
      this.#first = true;
      if (this.#cur || this.#left) {
        fatals();
      }
    }
    if (pos > 0) {
      res.push(String.fromCharCode.apply(null, out.subarray(0, pos)));
    }
    return res.join("");
  }
};

// node_modules/@cto.af/wtf8/lib/encode.js
function utf8length(str) {
  let len = 0;
  for (const s4 of str) {
    const cp = s4.codePointAt(0);
    if (cp < 128) {
      len++;
    } else if (cp < 2048) {
      len += 2;
    } else if (cp < 65536) {
      len += 3;
    } else {
      len += 4;
    }
  }
  return len;
}
var Wtf8Encoder = class {
  encoding = WTF8;
  encode(input) {
    if (!input) {
      return EMPTY;
    }
    const buf = new Uint8Array(utf8length(String(input)));
    this.encodeInto(input, buf);
    return buf;
  }
  encodeInto(source, destination) {
    const str = String(source);
    const len = str.length;
    const outLen = destination.length;
    let written = 0;
    let read = 0;
    for (read = 0; read < len; read++) {
      const c4 = str.codePointAt(read);
      if (c4 < 128) {
        if (written >= outLen) {
          break;
        }
        destination[written++] = c4;
      } else if (c4 < 2048) {
        if (written >= outLen - 1) {
          break;
        }
        destination[written++] = 192 | c4 >> 6;
        destination[written++] = 128 | c4 & 63;
      } else if (c4 < 65536) {
        if (written >= outLen - 2) {
          break;
        }
        destination[written++] = 224 | c4 >> 12;
        destination[written++] = 128 | c4 >> 6 & 63;
        destination[written++] = 128 | c4 & 63;
      } else {
        if (written >= outLen - 3) {
          break;
        }
        destination[written++] = 240 | c4 >> 18;
        destination[written++] = 128 | c4 >> 12 & 63;
        destination[written++] = 128 | c4 >> 6 & 63;
        destination[written++] = 128 | c4 & 63;
        read++;
      }
    }
    return {
      read,
      written
    };
  }
};

// node_modules/cbor2/lib/encoder.js
var { ENCODED: ce } = A2;
var U3 = f2.SIMPLE_FLOAT << 5 | I.TWO;
var h2 = f2.SIMPLE_FLOAT << 5 | I.FOUR;
var B3 = f2.SIMPLE_FLOAT << 5 | I.EIGHT;
var j = f2.SIMPLE_FLOAT << 5 | o.TRUE;
var q = f2.SIMPLE_FLOAT << 5 | o.FALSE;
var $ = f2.SIMPLE_FLOAT << 5 | o.UNDEFINED;
var z = f2.SIMPLE_FLOAT << 5 | o.NULL;
var H = new TextEncoder();
var K2 = new Wtf8Encoder();
var k2 = { ...e.defaultOptions, avoidInts: false, cde: false, collapseBigInts: true, dateTag: T.DATE_EPOCH, dcbor: false, float64: false, flushToZero: false, forceEndian: null, ignoreOriginalEncoding: false, largeNegativeAsBigInt: false, reduceUnsafeNumbers: false, rejectBigInts: false, rejectCustomSimples: false, rejectDuplicateKeys: false, rejectFloats: false, rejectUndefined: false, simplifyNegativeZero: false, sortKeys: null, stringNormalization: null, types: null, wtf8: false, ignoreGlobalTags: false };
var F2 = { cde: true, ignoreOriginalEncoding: true, sortKeys: f5 };
var Y = { ...F2, dcbor: true, largeNegativeAsBigInt: true, reduceUnsafeNumbers: true, rejectCustomSimples: true, rejectDuplicateKeys: true, rejectUndefined: true, simplifyNegativeZero: true, stringNormalization: "NFC" };
function y2(e2) {
  const n2 = e2 < 0;
  return typeof e2 == "bigint" ? [n2 ? -e2 - 1n : e2, n2] : [n2 ? -e2 - 1 : e2, n2];
}
function N3(e2, n2, i) {
  if (i.rejectFloats) throw new Error(`Attempt to encode an unwanted floating point number: ${e2}`);
  if (isNaN(e2)) n2.writeUint8(U3), n2.writeUint16(32256);
  else if (!i.float64 && Math.fround(e2) === e2) {
    const r3 = Z(e2);
    r3 === null ? (n2.writeUint8(h2), n2.writeFloat32(e2)) : (n2.writeUint8(U3), n2.writeUint16(r3));
  } else n2.writeUint8(B3), n2.writeFloat64(e2);
}
function a2(e2, n2, i) {
  const [r3, t3] = y2(e2);
  if (t3 && i) throw new TypeError(`Negative size: ${e2}`);
  i ??= t3 ? f2.NEG_INT : f2.POS_INT, i <<= 5, r3 < 24 ? n2.writeUint8(i | r3) : r3 <= 255 ? (n2.writeUint8(i | I.ONE), n2.writeUint8(r3)) : r3 <= 65535 ? (n2.writeUint8(i | I.TWO), n2.writeUint16(r3)) : r3 <= 4294967295 ? (n2.writeUint8(i | I.FOUR), n2.writeUint32(r3)) : (n2.writeUint8(i | I.EIGHT), n2.writeBigUint64(BigInt(r3)));
}
function m2(e2, n2, i) {
  typeof e2 == "number" ? a2(e2, n2, f2.TAG) : typeof e2 == "object" && !i.ignoreOriginalEncoding && A2.ENCODED in e2 ? n2.write(e2[A2.ENCODED]) : e2 <= Number.MAX_SAFE_INTEGER ? a2(Number(e2), n2, f2.TAG) : (n2.writeUint8(f2.TAG << 5 | I.EIGHT), n2.writeBigUint64(BigInt(e2)));
}
function O2(e2, n2, i) {
  const [r3, t3] = y2(e2);
  if (i.collapseBigInts && (!i.largeNegativeAsBigInt || e2 >= -0x8000000000000000n)) {
    if (r3 <= 0xffffffffn) {
      a2(Number(e2), n2);
      return;
    }
    if (r3 <= 0xffffffffffffffffn) {
      const l6 = (t3 ? f2.NEG_INT : f2.POS_INT) << 5;
      n2.writeUint8(l6 | I.EIGHT), n2.writeBigUint64(r3);
      return;
    }
  }
  if (i.rejectBigInts) throw new Error(`Attempt to encode unwanted bigint: ${e2}`);
  const o5 = t3 ? T.NEG_BIGINT : T.POS_BIGINT, c4 = r3.toString(16), s4 = c4.length % 2 ? "0" : "";
  m2(o5, n2, i);
  const u3 = b(s4 + c4);
  a2(u3.length, n2, f2.BYTE_STRING), n2.write(u3);
}
function Z2(e2, n2, i) {
  i.flushToZero && (e2 = k(e2)), Object.is(e2, -0) ? i.simplifyNegativeZero ? i.avoidInts ? N3(0, n2, i) : a2(0, n2) : N3(e2, n2, i) : !i.avoidInts && Number.isSafeInteger(e2) ? a2(e2, n2) : i.reduceUnsafeNumbers && Math.floor(e2) === e2 && e2 >= S.MIN && e2 <= S.MAX ? O2(BigInt(e2), n2, i) : N3(e2, n2, i);
}
function R3(e2, n2, i) {
  const r3 = i.stringNormalization ? e2.normalize(i.stringNormalization) : e2;
  if (i.wtf8 && !e2.isWellFormed()) {
    const t3 = K2.encode(r3);
    m2(T.WTF8, n2, i), a2(t3.length, n2, f2.BYTE_STRING), n2.write(t3);
  } else {
    const t3 = H.encode(r3);
    a2(t3.length, n2, f2.UTF8_STRING), n2.write(t3);
  }
}
function J(e2, n2, i) {
  const r3 = e2;
  L(r3, r3.length, f2.ARRAY, n2, i);
  for (const t3 of r3) g3(t3, n2, i);
}
function V(e2, n2) {
  a2(e2.length, n2, f2.BYTE_STRING), n2.write(e2);
}
var b3 = new s3();
b3.registerEncoder(Array, J), b3.registerEncoder(Uint8Array, V);
function ue(e2, n2) {
  return b3.registerEncoder(e2, n2);
}
function L(e2, n2, i, r3, t3) {
  const o5 = s2(e2);
  o5 && !t3.ignoreOriginalEncoding ? r3.write(o5) : a2(n2, r3, i);
}
function X(e2, n2, i) {
  if (e2 === null) {
    n2.writeUint8(z);
    return;
  }
  if (!i.ignoreOriginalEncoding && A2.ENCODED in e2) {
    n2.write(e2[A2.ENCODED]);
    return;
  }
  const r3 = e2.constructor;
  if (r3) {
    const o5 = i.types?.get(r3) ?? (i.ignoreGlobalTags ? void 0 : b3.get(r3));
    if (o5) {
      const c4 = o5(e2, n2, i);
      if (c4 !== void 0) {
        if (!Array.isArray(c4) || c4.length !== 2) throw new Error("Invalid encoder return value");
        (typeof c4[0] == "bigint" || isFinite(Number(c4[0]))) && m2(c4[0], n2, i), g3(c4[1], n2, i);
      }
      return;
    }
  }
  if (typeof e2.toCBOR == "function") {
    const o5 = e2.toCBOR(n2, i);
    o5 && ((typeof o5[0] == "bigint" || isFinite(Number(o5[0]))) && m2(o5[0], n2, i), g3(o5[1], n2, i));
    return;
  }
  if (typeof e2.toJSON == "function") {
    g3(e2.toJSON(), n2, i);
    return;
  }
  const t3 = Object.entries(e2).map((o5) => [o5[0], o5[1], v2(o5[0], i)]);
  i.sortKeys && t3.sort(i.sortKeys), L(e2, t3.length, f2.MAP, n2, i);
  for (const [o5, c4, s4] of t3) n2.write(s4), g3(c4, n2, i);
}
function Q(e2, n2, i) {
  if (!e2.description || e2 !== Symbol.for(e2.description)) throw new TypeError(`Private or empty symbol: ${e2.toString()}`);
  m2(280, n2, i), R3(e2.description, n2, i);
}
function g3(e2, n2, i) {
  switch (typeof e2) {
    case "number":
      Z2(e2, n2, i);
      break;
    case "bigint":
      O2(e2, n2, i);
      break;
    case "string":
      R3(e2, n2, i);
      break;
    case "boolean":
      n2.writeUint8(e2 ? j : q);
      break;
    case "undefined":
      if (i.rejectUndefined) throw new Error("Attempt to encode unwanted undefined.");
      n2.writeUint8($);
      break;
    case "object":
      X(e2, n2, i);
      break;
    case "symbol":
      Q(e2, n2, i);
      break;
    default:
      throw new TypeError(`Unknown type: ${typeof e2}, ${String(e2)}`);
  }
}
function v2(e2, n2 = {}) {
  const i = { ...k2 };
  n2.dcbor ? Object.assign(i, Y) : n2.cde && Object.assign(i, F2), Object.assign(i, n2);
  const r3 = new e(i);
  return g3(e2, r3, i), r3.read();
}

// node_modules/cbor2/lib/options.js
var o3 = ((e2) => (e2[e2.NEVER = -1] = "NEVER", e2[e2.PREFERRED = 0] = "PREFERRED", e2[e2.ALWAYS = 1] = "ALWAYS", e2))(o3 || {});

// node_modules/cbor2/lib/simple.js
var t = class _t {
  static KnownSimple = /* @__PURE__ */ new Map([[o.FALSE, false], [o.TRUE, true], [o.NULL, null], [o.UNDEFINED, void 0]]);
  value;
  constructor(e2) {
    this.value = e2;
  }
  static create(e2) {
    return _t.KnownSimple.has(e2) ? _t.KnownSimple.get(e2) : new _t(e2);
  }
  toCBOR(e2, i) {
    if (i.rejectCustomSimples) throw new Error(`Cannot encode non-standard Simple value: ${this.value}`);
    a2(this.value, e2, f2.SIMPLE_FLOAT);
  }
  toString() {
    return `simple(${this.value})`;
  }
  decode() {
    return _t.KnownSimple.has(this.value) ? _t.KnownSimple.get(this.value) : this;
  }
  [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")](e2, i, r3) {
    return `simple(${r3(this.value, i)})`;
  }
};

// node_modules/cbor2/lib/decodeStream.js
var p3 = new TextDecoder("utf8", { fatal: true, ignoreBOM: true });
var y3 = class _y {
  static defaultOptions = { maxDepth: 1024, encoding: "hex", requirePreferred: false };
  #t;
  #r;
  #e = 0;
  #i;
  constructor(t3, r3) {
    if (this.#i = { ..._y.defaultOptions, ...r3 }, typeof t3 == "string") switch (this.#i.encoding) {
      case "hex":
        this.#t = b(t3);
        break;
      case "base64":
        this.#t = y(t3);
        break;
      default:
        throw new TypeError(`Encoding not implemented: "${this.#i.encoding}"`);
    }
    else this.#t = t3;
    this.#r = new DataView(this.#t.buffer, this.#t.byteOffset, this.#t.byteLength);
  }
  toHere(t3) {
    return R2(this.#t, t3, this.#e);
  }
  *[Symbol.iterator]() {
    if (yield* this.#n(0), this.#e !== this.#t.length) throw new Error("Extra data in input");
  }
  *seq() {
    for (; this.#e < this.#t.length; ) yield* this.#n(0);
  }
  *#n(t3) {
    if (t3++ > this.#i.maxDepth) throw new Error(`Maximum depth ${this.#i.maxDepth} exceeded`);
    const r3 = this.#e, c4 = this.#r.getUint8(this.#e++), i = c4 >> 5, n2 = c4 & 31;
    let e2 = n2, f8 = false, a4 = 0;
    switch (n2) {
      case I.ONE:
        if (a4 = 1, e2 = this.#r.getUint8(this.#e), i === f2.SIMPLE_FLOAT) {
          if (e2 < 32) throw new Error(`Invalid simple encoding in extra byte: ${e2}`);
          f8 = true;
        } else if (this.#i.requirePreferred && e2 < 24) throw new Error(`Unexpectedly long integer encoding (1) for ${e2}`);
        break;
      case I.TWO:
        if (a4 = 2, i === f2.SIMPLE_FLOAT) e2 = v(this.#t, this.#e);
        else if (e2 = this.#r.getUint16(this.#e, false), this.#i.requirePreferred && e2 <= 255) throw new Error(`Unexpectedly long integer encoding (2) for ${e2}`);
        break;
      case I.FOUR:
        if (a4 = 4, i === f2.SIMPLE_FLOAT) e2 = this.#r.getFloat32(this.#e, false);
        else if (e2 = this.#r.getUint32(this.#e, false), this.#i.requirePreferred && e2 <= 65535) throw new Error(`Unexpectedly long integer encoding (4) for ${e2}`);
        break;
      case I.EIGHT: {
        if (a4 = 8, i === f2.SIMPLE_FLOAT) e2 = this.#r.getFloat64(this.#e, false);
        else if (e2 = this.#r.getBigUint64(this.#e, false), e2 <= Number.MAX_SAFE_INTEGER && (e2 = Number(e2)), this.#i.requirePreferred && e2 <= 4294967295) throw new Error(`Unexpectedly long integer encoding (8) for ${e2}`);
        break;
      }
      case 28:
      case 29:
      case 30:
        throw new Error(`Additional info not implemented: ${n2}`);
      case I.INDEFINITE:
        switch (i) {
          case f2.POS_INT:
          case f2.NEG_INT:
          case f2.TAG:
            throw new Error(`Invalid indefinite encoding for MT ${i}`);
          case f2.SIMPLE_FLOAT:
            yield [i, n2, A2.BREAK, r3, 0];
            return;
        }
        e2 = 1 / 0;
        break;
      default:
        f8 = true;
    }
    switch (this.#e += a4, i) {
      case f2.POS_INT:
        yield [i, n2, e2, r3, a4];
        break;
      case f2.NEG_INT:
        yield [i, n2, typeof e2 == "bigint" ? -1n - e2 : -1 - Number(e2), r3, a4];
        break;
      case f2.BYTE_STRING:
        e2 === 1 / 0 ? yield* this.#s(i, t3, r3) : yield [i, n2, this.#a(e2), r3, e2];
        break;
      case f2.UTF8_STRING:
        e2 === 1 / 0 ? yield* this.#s(i, t3, r3) : yield [i, n2, p3.decode(this.#a(e2)), r3, e2];
        break;
      case f2.ARRAY:
        if (e2 === 1 / 0) yield* this.#s(i, t3, r3, false);
        else {
          const o5 = Number(e2);
          yield [i, n2, o5, r3, a4];
          for (let h4 = 0; h4 < o5; h4++) yield* this.#n(t3 + 1);
        }
        break;
      case f2.MAP:
        if (e2 === 1 / 0) yield* this.#s(i, t3, r3, false);
        else {
          const o5 = Number(e2);
          yield [i, n2, o5, r3, a4];
          for (let h4 = 0; h4 < o5; h4++) yield* this.#n(t3), yield* this.#n(t3);
        }
        break;
      case f2.TAG:
        yield [i, n2, e2, r3, a4], yield* this.#n(t3);
        break;
      case f2.SIMPLE_FLOAT: {
        const o5 = e2;
        f8 && (e2 = t.create(Number(e2))), yield [i, n2, e2, r3, o5];
        break;
      }
    }
  }
  #a(t3) {
    const r3 = R2(this.#t, this.#e, this.#e += t3);
    if (r3.length !== t3) throw new Error(`Unexpected end of stream reading ${t3} bytes, got ${r3.length}`);
    return r3;
  }
  *#s(t3, r3, c4, i = true) {
    for (yield [t3, I.INDEFINITE, 1 / 0, c4, 1 / 0]; ; ) {
      const n2 = this.#n(r3), e2 = n2.next(), [f8, a4, o5] = e2.value;
      if (o5 === A2.BREAK) {
        yield e2.value, n2.next();
        return;
      }
      if (i) {
        if (f8 !== t3) throw new Error(`Unmatched major type.  Expected ${t3}, got ${f8}.`);
        if (a4 === I.INDEFINITE) throw new Error("New stream started in typed stream");
      }
      yield e2.value, yield* n2;
    }
  }
};

// node_modules/cbor2/lib/container.js
var A5 = /* @__PURE__ */ new Map([[I.ZERO, 1], [I.ONE, 2], [I.TWO, 3], [I.FOUR, 5], [I.EIGHT, 9]]);
var R4 = new Uint8Array(0);
function F3(h4, r3) {
  return !r3.boxed && !r3.preferMap && h4.every(([i]) => typeof i == "string") ? Object.fromEntries(h4) : new Map(h4);
}
var y4 = class _y {
  static defaultDecodeOptions = { ...y3.defaultOptions, ParentType: _y, boxed: false, cde: false, dcbor: false, diagnosticSizes: o3.PREFERRED, collapseBigInts: false, convertUnsafeIntsToFloat: false, createObject: F3, keepNanPayloads: false, pretty: false, preferBigInt: false, preferMap: false, rejectLargeNegatives: false, rejectBigInts: false, rejectDuplicateKeys: false, rejectFloats: false, rejectInts: false, rejectLongLoundNaN: false, rejectLongFloats: false, rejectNegativeZero: false, rejectSimple: false, rejectStreaming: false, rejectStringsNotNormalizedAs: null, rejectSubnormals: false, rejectUndefined: false, rejectUnsafeFloatInts: false, saveOriginal: false, sortKeys: null, tags: null, ignoreGlobalTags: false };
  static cdeDecodeOptions = { cde: true, rejectStreaming: true, requirePreferred: true, sortKeys: f5 };
  static dcborDecodeOptions = { ...this.cdeDecodeOptions, dcbor: true, convertUnsafeIntsToFloat: true, rejectDuplicateKeys: true, rejectLargeNegatives: true, rejectLongLoundNaN: true, rejectLongFloats: true, rejectNegativeZero: true, rejectSimple: true, rejectUndefined: true, rejectUnsafeFloatInts: true, rejectStringsNotNormalizedAs: "NFC" };
  parent;
  mt;
  ai;
  left;
  offset;
  count = 0;
  children = [];
  depth = 0;
  #e;
  #t = null;
  constructor(r3, i, e2, t3) {
    if ([this.mt, this.ai, , this.offset] = r3, this.left = i, this.parent = e2, this.#e = t3, e2 && (this.depth = e2.depth + 1), this.mt === f2.MAP && (this.#e.sortKeys || this.#e.rejectDuplicateKeys) && (this.#t = []), this.#e.rejectStreaming && this.ai === I.INDEFINITE) throw new Error("Streaming not supported");
  }
  get isStreaming() {
    return this.left === 1 / 0;
  }
  get done() {
    return this.left === 0;
  }
  static create(r3, i, e2, t3) {
    const [s4, u3, n2, c4] = r3;
    switch (s4) {
      case f2.POS_INT:
      case f2.NEG_INT: {
        if (e2.rejectInts) throw new Error(`Unexpected integer: ${n2}`);
        if (e2.rejectLargeNegatives && n2 < -0x8000000000000000n) throw new Error(`Invalid 65bit negative number: ${n2}`);
        let o5 = n2;
        return e2.preferBigInt ? o5 = BigInt(o5) : e2.convertUnsafeIntsToFloat && o5 >= S.MIN && o5 <= S.MAX && (o5 = Number(n2)), e2.boxed ? d(o5, t3.toHere(c4)) : o5;
      }
      case f2.SIMPLE_FLOAT:
        if (u3 > I.ONE) {
          if (typeof n2 == "symbol") return n2;
          if (e2.rejectFloats) throw new Error(`Decoding unwanted floating point number: ${n2}`);
          if (e2.rejectNegativeZero && Object.is(n2, -0)) throw new Error("Decoding negative zero");
          if (isNaN(n2)) {
            const o5 = t3.toHere(c4), f8 = new O(o5);
            if (e2.rejectLongLoundNaN) {
              if (f8.payload || o5.length > 3) throw new Error(`Invalid NaN encoding: "${A3(o5)}"`);
            } else if (e2.keepNanPayloads && (f8.payload || f8.sign === -1)) {
              if (e2.rejectLongFloats && !f8.isShortestEncoding) throw new Error(`NaN should have been encoded shorter: ${n2}`);
              return f8;
            }
          }
          if (e2.rejectSubnormals && B2(t3.toHere(c4 + 1)), e2.rejectLongFloats) {
            const o5 = v2(n2, { chunkSize: 9, reduceUnsafeNumbers: e2.rejectUnsafeFloatInts });
            if (o5[0] >> 5 !== s4) throw new Error(`Should have been encoded as int, not float: ${n2}`);
            if (o5.length < A5.get(u3)) throw new Error(`Number should have been encoded shorter: ${n2}`);
          }
          if (typeof n2 == "number" && e2.boxed) return d(n2, t3.toHere(c4));
        } else {
          if (e2.rejectSimple && n2 instanceof t) throw new Error(`Invalid simple value: ${n2}`);
          if (e2.rejectUndefined && n2 === void 0) throw new Error("Unexpected undefined");
        }
        return n2;
      case f2.BYTE_STRING:
      case f2.UTF8_STRING:
        if (n2 === 1 / 0) return new e2.ParentType(r3, 1 / 0, i, e2);
        if (e2.rejectStringsNotNormalizedAs && typeof n2 == "string") {
          const o5 = n2.normalize(e2.rejectStringsNotNormalizedAs);
          if (n2 !== o5) throw new Error(`String not normalized as "${e2.rejectStringsNotNormalizedAs}", got [${U(n2)}] instead of [${U(o5)}]`);
        }
        return e2.boxed ? d(n2, t3.toHere(c4)) : n2;
      case f2.ARRAY:
        return new e2.ParentType(r3, n2, i, e2);
      case f2.MAP:
        return new e2.ParentType(r3, n2 * 2, i, e2);
      case f2.TAG: {
        const o5 = new e2.ParentType(r3, 1, i, e2);
        return o5.children = new o2(n2), o5;
      }
    }
    throw new TypeError(`Invalid major type: ${s4}`);
  }
  static decodeToEncodeOpts(r3) {
    return { ...k2, avoidInts: r3.rejectInts, float64: !r3.rejectLongFloats, flushToZero: r3.rejectSubnormals, largeNegativeAsBigInt: r3.rejectLargeNegatives, sortKeys: r3.sortKeys };
  }
  push(r3, i, e2) {
    if (this.children.push(r3), this.#t) {
      const t3 = f3(r3) || i.toHere(e2);
      this.#t.push(t3);
    }
    return --this.left;
  }
  replaceLast(r3, i, e2) {
    let t3, s4 = -1 / 0;
    if (this.children instanceof o2 ? (s4 = 0, t3 = this.children.contents, this.children.contents = r3) : (s4 = this.children.length - 1, t3 = this.children[s4], this.children[s4] = r3), this.#t) {
      const u3 = f3(r3) || e2.toHere(i.offset);
      this.#t[s4] = u3;
    }
    return t3;
  }
  convert(r3) {
    let i;
    switch (this.mt) {
      case f2.ARRAY:
        i = this.children;
        break;
      case f2.MAP: {
        const e2 = this.#r();
        if (this.#e.sortKeys) {
          let t3;
          for (const s4 of e2) {
            if (t3 && this.#e.sortKeys(t3, s4) >= 0) throw new Error(`Duplicate or out of order key: "0x${s4[2]}"`);
            t3 = s4;
          }
        } else if (this.#e.rejectDuplicateKeys) {
          const t3 = /* @__PURE__ */ new Set();
          for (const [s4, u3, n2] of e2) {
            const c4 = A3(n2);
            if (t3.has(c4)) throw new Error(`Duplicate key: "0x${c4}"`);
            t3.add(c4);
          }
        }
        i = this.#e.createObject(e2, this.#e);
        break;
      }
      case f2.BYTE_STRING:
        return d2(this.children);
      case f2.UTF8_STRING: {
        const e2 = this.children.join("");
        i = this.#e.boxed ? d(e2, r3.toHere(this.offset)) : e2;
        break;
      }
      case f2.TAG:
        i = this.children.decode(this.#e);
        break;
      default:
        throw new TypeError(`Invalid mt on convert: ${this.mt}`);
    }
    return this.#e.saveOriginal && i && typeof i == "object" && u(i, r3.toHere(this.offset)), i;
  }
  #r() {
    const r3 = this.children, i = r3.length;
    if (i % 2) throw new Error("Missing map value");
    const e2 = new Array(i / 2);
    if (this.#t) for (let t3 = 0; t3 < i; t3 += 2) e2[t3 >> 1] = [r3[t3], r3[t3 + 1], this.#t[t3]];
    else for (let t3 = 0; t3 < i; t3 += 2) e2[t3 >> 1] = [r3[t3], r3[t3 + 1], R4];
    return e2;
  }
};

// node_modules/cbor2/lib/diagnostic.js
var O3 = "  ";
var y5 = new TextEncoder();
var g4 = class extends y4 {
  close = "";
  quote = '"';
  get isEmptyStream() {
    return (this.mt === f2.UTF8_STRING || this.mt === f2.BYTE_STRING) && this.count === 0;
  }
};
function a3(m4, l6, n2, p5) {
  let t3 = "";
  if (l6 === I.INDEFINITE) t3 += "_";
  else {
    if (p5.diagnosticSizes === o3.NEVER) return "";
    {
      let r3 = p5.diagnosticSizes === o3.ALWAYS;
      if (!r3) {
        let e2 = I.ZERO;
        if (Object.is(n2, -0)) e2 = I.TWO;
        else if (m4 === f2.POS_INT || m4 === f2.NEG_INT) {
          const T2 = n2 < 0, u3 = typeof n2 == "bigint" ? 1n : 1, o5 = T2 ? -n2 - u3 : n2;
          o5 <= 23 ? e2 = Number(o5) : o5 <= 255 ? e2 = I.ONE : o5 <= 65535 ? e2 = I.TWO : o5 <= 4294967295 ? e2 = I.FOUR : e2 = I.EIGHT;
        } else isFinite(n2) ? Math.fround(n2) === n2 ? Z(n2) == null ? e2 = I.FOUR : e2 = I.TWO : e2 = I.EIGHT : e2 = I.TWO;
        r3 = e2 !== l6;
      }
      r3 && (t3 += "_", l6 < I.ONE ? t3 += "i" : t3 += String(l6 - 24));
    }
  }
  return t3;
}
function M(m4, l6) {
  const n2 = { ...y4.defaultDecodeOptions, ...l6, ParentType: g4 }, p5 = new y3(m4, n2);
  let t3, r3, e2 = "";
  for (const T2 of p5) {
    const [u3, o5, i] = T2;
    switch (t3 && (t3.count > 0 && i !== A2.BREAK && (t3.mt === f2.MAP && t3.count % 2 ? e2 += ": " : (e2 += ",", n2.pretty || (e2 += " "))), n2.pretty && (t3.mt !== f2.MAP || t3.count % 2 === 0) && (e2 += `
${O3.repeat(t3.depth + 1)}`)), r3 = y4.create(T2, t3, n2, p5), u3) {
      case f2.POS_INT:
      case f2.NEG_INT:
        e2 += String(i), e2 += a3(u3, o5, i, n2);
        break;
      case f2.SIMPLE_FLOAT:
        if (i !== A2.BREAK) if (typeof i == "number") {
          const c4 = Object.is(i, -0) ? "-0.0" : String(i);
          e2 += c4, isFinite(i) && !/[.e]/.test(c4) && (e2 += ".0"), e2 += a3(u3, o5, i, n2);
        } else i instanceof t ? (e2 += "simple(", e2 += String(i.value), e2 += a3(f2.POS_INT, o5, i.value, n2), e2 += ")") : e2 += String(i);
        break;
      case f2.BYTE_STRING:
        i === 1 / 0 ? (e2 += "(_ ", r3.close = ")", r3.quote = "'") : (e2 += "h'", e2 += A3(i), e2 += "'", e2 += a3(f2.POS_INT, o5, i.length, n2));
        break;
      case f2.UTF8_STRING:
        i === 1 / 0 ? (e2 += "(_ ", r3.close = ")") : (e2 += JSON.stringify(i), e2 += a3(f2.POS_INT, o5, y5.encode(i).length, n2));
        break;
      case f2.ARRAY: {
        e2 += "[";
        const c4 = a3(f2.POS_INT, o5, i, n2);
        e2 += c4, c4 && (e2 += " "), n2.pretty && i ? r3.close = `
${O3.repeat(r3.depth)}]` : r3.close = "]";
        break;
      }
      case f2.MAP: {
        e2 += "{";
        const c4 = a3(f2.POS_INT, o5, i, n2);
        e2 += c4, c4 && (e2 += " "), n2.pretty && i ? r3.close = `
${O3.repeat(r3.depth)}}` : r3.close = "}";
        break;
      }
      case f2.TAG:
        e2 += String(i), e2 += a3(f2.POS_INT, o5, i, n2), e2 += "(", r3.close = ")";
        break;
    }
    if (r3 === A2.BREAK) if (t3?.isStreaming) t3.left = 0;
    else throw new Error("Unexpected BREAK");
    else t3 && (t3.count++, t3.left--);
    for (r3 instanceof g4 && (t3 = r3); t3?.done; ) {
      if (t3.isEmptyStream) e2 = e2.slice(0, -3), e2 += `${t3.quote}${t3.quote}_`;
      else {
        if (t3.mt === f2.MAP && t3.count % 2 !== 0) throw new Error(`Odd streaming map size: ${t3.count}`);
        e2 += t3.close;
      }
      t3 = t3.parent;
    }
  }
  return e2;
}

// node_modules/cbor2/lib/comment.js
var H2 = new TextDecoder();
var A6 = class extends y4 {
  depth = 0;
  leaf = false;
  value;
  length;
  [A2.ENCODED];
  constructor(a4, f8, e2, n2) {
    super(a4, f8, e2, n2), this.parent ? this.depth = this.parent.depth + 1 : this.depth = n2.initialDepth, [, , this.value, , this.length] = a4;
  }
  numBytes() {
    switch (this.ai) {
      case I.ONE:
        return 1;
      case I.TWO:
        return 2;
      case I.FOUR:
        return 4;
      case I.EIGHT:
        return 8;
    }
    return 0;
  }
};
function k3(t3) {
  return t3 instanceof A6;
}
function O4(t3, a4) {
  return t3 === 1 / 0 ? "Indefinite" : a4 ? `${t3} ${a4}${t3 !== 1 && t3 !== 1n ? "s" : ""}` : String(t3);
}
function y6(t3) {
  return "".padStart(t3, " ");
}
function x3(t3, a4, f8) {
  let e2 = "";
  e2 += y6(t3.depth * 2);
  const n2 = f3(t3);
  e2 += A3(n2.subarray(0, 1));
  const r3 = t3.numBytes();
  r3 && (e2 += " ", e2 += A3(n2.subarray(1, r3 + 1))), e2 = e2.padEnd(a4.minCol + 1, " "), e2 += "-- ", f8 !== void 0 && (e2 += y6(t3.depth * 2), f8 !== "" && (e2 += `[${f8}] `));
  let p5 = false;
  const [s4] = t3.children;
  switch (t3.mt) {
    case f2.POS_INT:
      e2 += `Unsigned: ${s4}`, typeof s4 == "bigint" && (e2 += "n");
      break;
    case f2.NEG_INT:
      e2 += `Negative: ${s4}`, typeof s4 == "bigint" && (e2 += "n");
      break;
    case f2.BYTE_STRING:
      e2 += `Bytes (Length: ${O4(t3.length)})`;
      break;
    case f2.UTF8_STRING:
      e2 += `UTF8 (Length: ${O4(t3.length)})`, t3.length !== 1 / 0 && (e2 += `: ${JSON.stringify(s4)}`);
      break;
    case f2.ARRAY:
      e2 += `Array (Length: ${O4(t3.value, "item")})`;
      break;
    case f2.MAP:
      e2 += `Map (Length: ${O4(t3.value, "pair")})`;
      break;
    case f2.TAG: {
      e2 += `Tag #${t3.value}`;
      const o5 = t3.children, [m4] = o5.contents.children, i = new o2(o5.tag, m4);
      u(i, n2);
      const l6 = i.comment(a4, t3.depth);
      l6 && (e2 += ": ", e2 += l6), p5 ||= i.noChildren;
      break;
    }
    case f2.SIMPLE_FLOAT:
      s4 === A2.BREAK ? e2 += "BREAK" : t3.ai > I.ONE ? Object.is(s4, -0) ? e2 += "Float: -0" : e2 += `Float: ${s4}` : (e2 += "Simple: ", s4 instanceof t ? e2 += s4.value : e2 += s4);
      break;
  }
  if (!p5) if (t3.leaf) {
    if (e2 += `
`, n2.length > r3 + 1) {
      const o5 = y6((t3.depth + 1) * 2), m4 = f4(n2);
      if (m4?.length) {
        m4.sort((l6, c4) => {
          const g5 = l6[0] - c4[0];
          return g5 || c4[1] - l6[1];
        });
        let i = 0;
        for (const [l6, c4, g5] of m4) if (!(l6 < i)) {
          if (i = l6 + c4, g5 === "<<") {
            e2 += y6(a4.minCol + 1), e2 += "--", e2 += o5, e2 += "<< ";
            const d5 = R2(n2, l6, l6 + c4), h4 = f4(d5);
            if (h4) {
              const $3 = h4.findIndex(([w3, D, v3]) => w3 === 0 && D === c4 && v3 === "<<");
              $3 >= 0 && h4.splice($3, 1);
            }
            e2 += M(d5), e2 += ` >>
`, e2 += L2(d5, { initialDepth: t3.depth + 1, minCol: a4.minCol, noPrefixHex: true });
            continue;
          } else g5 === "'" && (e2 += y6(a4.minCol + 1), e2 += "--", e2 += o5, e2 += "'", e2 += H2.decode(n2.subarray(l6, l6 + c4)), e2 += `'
`);
          if (l6 > r3) for (let d5 = l6; d5 < l6 + c4; d5 += 8) {
            const h4 = Math.min(d5 + 8, l6 + c4);
            e2 += o5, e2 += A3(n2.subarray(d5, h4)), e2 += `
`;
          }
        }
      } else for (let i = r3 + 1; i < n2.length; i += 8) e2 += o5, e2 += A3(n2.subarray(i, i + 8)), e2 += `
`;
    }
  } else {
    e2 += `
`;
    let o5 = 0;
    for (const m4 of t3.children) {
      if (k3(m4)) {
        let i = String(o5);
        t3.mt === f2.MAP ? i = o5 % 2 ? `val ${(o5 - 1) / 2}` : `key ${o5 / 2}` : t3.mt === f2.TAG && (i = ""), e2 += x3(m4, a4, i);
      }
      o5++;
    }
  }
  return e2;
}
var q2 = { ...y4.defaultDecodeOptions, initialDepth: 0, noPrefixHex: false, minCol: 0 };
function L2(t3, a4) {
  const f8 = { ...q2, ...a4, ParentType: A6, saveOriginal: true }, e2 = new y3(t3, f8);
  let n2, r3;
  for (const s4 of e2) {
    if (r3 = y4.create(s4, n2, f8, e2), s4[2] === A2.BREAK) if (n2?.isStreaming) n2.left = 1;
    else throw new Error("Unexpected BREAK");
    if (!k3(r3)) {
      const i = new A6(s4, 0, n2, f8);
      i.leaf = true, i.children.push(r3), u(i, e2.toHere(s4[3])), r3 = i;
    }
    let o5 = (r3.depth + 1) * 2;
    const m4 = r3.numBytes();
    for (m4 && (o5 += 1, o5 += m4 * 2), f8.minCol = Math.max(f8.minCol, o5), n2 && n2.push(r3, e2, s4[3]), n2 = r3; n2?.done; ) r3 = n2, r3.leaf || u(r3, e2.toHere(r3.offset)), { parent: n2 } = n2;
  }
  a4 && (a4.minCol = f8.minCol);
  let p5 = f8.noPrefixHex ? "" : `0x${A3(e2.toHere(0))}
`;
  return p5 += x3(r3, f8), p5;
}

// node_modules/cbor2/lib/types.js
var U4 = !h();
function I3(e2) {
  if (typeof e2 == "object" && e2) {
    if (e2.constructor !== Number) throw new Error(`Expected number: ${e2}`);
  } else if (typeof e2 != "number") throw new Error(`Expected number: ${e2}`);
}
function f7(e2) {
  if (typeof e2 == "object" && e2) {
    if (e2.constructor !== String) throw new Error(`Expected string: ${e2}`);
  } else if (typeof e2 != "string") throw new Error(`Expected string: ${e2}`);
}
function E2(e2) {
  if (!(e2 instanceof Uint8Array)) throw new Error(`Expected Uint8Array: ${e2}`);
}
function _2(e2) {
  if (!Array.isArray(e2)) throw new Error(`Expected Array: ${e2}`);
}
ue(Map, (e2, r3, n2) => {
  const i = [...e2.entries()].map((a4) => [a4[0], a4[1], v2(a4[0], n2)]);
  if (n2.rejectDuplicateKeys) {
    const a4 = /* @__PURE__ */ new Set();
    for (const [d5, u3, g5] of i) {
      const y7 = A3(g5);
      if (a4.has(y7)) throw new Error(`Duplicate map key: 0x${y7}`);
      a4.add(y7);
    }
  }
  n2.sortKeys && i.sort(n2.sortKeys), L(e2, e2.size, f2.MAP, r3, n2);
  for (const [a4, d5, u3] of i) r3.write(u3), g3(d5, r3, n2);
});
function w2(e2) {
  return f7(e2.contents), new Date(e2.contents);
}
w2.comment = (e2) => {
  f7(e2.contents);
  const r3 = new Date(e2.contents);
  return `(String ${e2.tag === T.DATE_FULL ? "Full " : ""}Date) ${r3.toISOString()}`;
}, o2.registerDecoder(T.DATE_STRING, w2), o2.registerDecoder(T.DATE_FULL, w2);
function N4(e2) {
  return I3(e2.contents), new Date(e2.contents * 1e3);
}
N4.comment = (e2) => (I3(e2.contents), `(Epoch Date) ${new Date(e2.contents * 1e3).toISOString()}`), o2.registerDecoder(T.DATE_EPOCH, N4);
var S3 = 1e3 * 60 * 60 * 24;
function $2(e2) {
  return I3(e2.contents), new Date(e2.contents * S3);
}
$2.comment = (e2) => (I3(e2.contents), `(Epoch Date) ${new Date(e2.contents * S3).toISOString()}`), o2.registerDecoder(T.DATE_EPOCH_DAYS, $2), ue(Date, (e2, r3, n2) => {
  switch (n2.dateTag) {
    case T.DATE_EPOCH:
      return [n2.dateTag, e2.valueOf() / 1e3];
    case T.DATE_STRING:
      return [n2.dateTag, e2.toISOString().replace(/\.000Z$/, "Z")];
    case T.DATE_EPOCH_DAYS:
      return [n2.dateTag, Math.floor(e2.valueOf() / S3)];
    case T.DATE_FULL:
      return [n2.dateTag, e2.toISOString().split("T")[0]];
    default:
      throw new Error(`Unsupported date tag: ${n2.dateTag}`);
  }
});
function m3(e2, r3, n2) {
  if (E2(r3.contents), n2.rejectBigInts) throw new Error(`Decoding unwanted big integer: ${r3}(h'${A3(r3.contents)}')`);
  if (n2.requirePreferred && r3.contents[0] === 0) throw new Error(`Decoding overly-large bigint: ${r3.tag}(h'${A3(r3.contents)})`);
  let i = r3.contents.reduce((d5, u3) => d5 << 8n | BigInt(u3), 0n);
  e2 && (i = -1n - i);
  const a4 = i >= Number.MIN_SAFE_INTEGER && i <= Number.MAX_SAFE_INTEGER;
  if (n2.requirePreferred && a4) throw new Error(`Decoding bigint that could have been int: ${i}n`);
  return n2.collapseBigInts && a4 && (i = Number(i)), n2.boxed ? d(i, r3.contents) : i;
}
var L3 = m3.bind(null, false);
var x4 = m3.bind(null, true);
L3.comment = (e2, r3) => `(Positive BigInt) ${m3(false, e2, r3)}n`, x4.comment = (e2, r3) => `(Negative BigInt) ${m3(true, e2, r3)}n`, o2.registerDecoder(T.POS_BIGINT, L3), o2.registerDecoder(T.NEG_BIGINT, x4);
function R5(e2, r3) {
  return E2(e2.contents), e2;
}
R5.comment = (e2, r3, n2) => {
  E2(e2.contents);
  const i = { ...r3, initialDepth: n2 + 2, noPrefixHex: true }, a4 = f3(e2);
  let u3 = 2 ** ((a4[0] & 31) - 24) + 1;
  const g5 = a4[u3] & 31;
  let y7 = A3(a4.subarray(u3, ++u3));
  g5 >= 24 && (y7 += " ", y7 += A3(a4.subarray(u3, u3 + 2 ** (g5 - 24)))), i.minCol = Math.max(i.minCol, (n2 + 1) * 2 + y7.length);
  const D = L2(e2.contents, i);
  let T2 = `Embedded CBOR
`;
  return T2 += `${"".padStart((n2 + 1) * 2, " ")}${y7}`.padEnd(i.minCol + 1, " "), T2 += `-- Bytes (Length: ${e2.contents.length})
`, T2 += D, T2;
}, R5.noChildren = true, o2.registerDecoder(T.CBOR, R5), o2.registerDecoder(T.URI, (e2) => (f7(e2.contents), new URL(e2.contents)), "URI"), ue(URL, (e2) => [T.URI, e2.toString()]), o2.registerDecoder(T.BASE64URL, (e2) => (f7(e2.contents), x(e2.contents)), "Base64url-encoded"), o2.registerDecoder(T.BASE64, (e2) => (f7(e2.contents), y(e2.contents)), "Base64-encoded"), o2.registerDecoder(35, (e2) => (f7(e2.contents), new RegExp(e2.contents)), "RegExp"), o2.registerDecoder(21065, (e2) => {
  f7(e2.contents);
  const r3 = `^(?:${e2.contents})$`;
  return new RegExp(r3, "u");
}, "I-RegExp"), o2.registerDecoder(T.REGEXP, (e2) => {
  if (_2(e2.contents), e2.contents.length < 1 || e2.contents.length > 2) throw new Error(`Invalid RegExp Array: ${e2.contents}`);
  return new RegExp(e2.contents[0], e2.contents[1]);
}, "RegExp"), ue(RegExp, (e2) => [T.REGEXP, [e2.source, e2.flags]]), o2.registerDecoder(64, (e2) => (E2(e2.contents), e2.contents), "uint8 Typed Array");
function c3(e2, r3, n2) {
  E2(e2.contents);
  let i = e2.contents.length;
  if (i % r3.BYTES_PER_ELEMENT !== 0) throw new Error(`Number of bytes must be divisible by ${r3.BYTES_PER_ELEMENT}, got: ${i}`);
  i /= r3.BYTES_PER_ELEMENT;
  const a4 = new r3(i), d5 = new DataView(e2.contents.buffer, e2.contents.byteOffset, e2.contents.byteLength), u3 = d5[`get${r3.name.replace(/Array/, "")}`].bind(d5);
  for (let g5 = 0; g5 < i; g5++) a4[g5] = u3(g5 * r3.BYTES_PER_ELEMENT, n2);
  return a4;
}
function l3(e2, r3, n2, i, a4) {
  const d5 = a4.forceEndian ?? U4;
  if (m2(d5 ? r3 : n2, e2, a4), a2(i.byteLength, e2, f2.BYTE_STRING), U4 === d5) e2.write(new Uint8Array(i.buffer, i.byteOffset, i.byteLength));
  else {
    const g5 = `write${i.constructor.name.replace(/Array/, "")}`, y7 = e2[g5].bind(e2);
    for (const D of i) y7(D, d5);
  }
}
o2.registerDecoder(65, (e2) => c3(e2, Uint16Array, false), "uint16, big endian, Typed Array"), o2.registerDecoder(66, (e2) => c3(e2, Uint32Array, false), "uint32, big endian, Typed Array"), o2.registerDecoder(67, (e2) => c3(e2, BigUint64Array, false), "uint64, big endian, Typed Array"), o2.registerDecoder(68, (e2) => (E2(e2.contents), new Uint8ClampedArray(e2.contents)), "uint8 Typed Array, clamped arithmetic"), ue(Uint8ClampedArray, (e2) => [68, new Uint8Array(e2.buffer, e2.byteOffset, e2.byteLength)]), o2.registerDecoder(69, (e2) => c3(e2, Uint16Array, true), "uint16, little endian, Typed Array"), ue(Uint16Array, (e2, r3, n2) => l3(r3, 69, 65, e2, n2)), o2.registerDecoder(70, (e2) => c3(e2, Uint32Array, true), "uint32, little endian, Typed Array"), ue(Uint32Array, (e2, r3, n2) => l3(r3, 70, 66, e2, n2)), o2.registerDecoder(71, (e2) => c3(e2, BigUint64Array, true), "uint64, little endian, Typed Array"), ue(BigUint64Array, (e2, r3, n2) => l3(r3, 71, 67, e2, n2)), o2.registerDecoder(72, (e2) => (E2(e2.contents), new Int8Array(e2.contents)), "sint8 Typed Array"), ue(Int8Array, (e2) => [72, new Uint8Array(e2.buffer, e2.byteOffset, e2.byteLength)]), o2.registerDecoder(73, (e2) => c3(e2, Int16Array, false), "sint16, big endian, Typed Array"), o2.registerDecoder(74, (e2) => c3(e2, Int32Array, false), "sint32, big endian, Typed Array"), o2.registerDecoder(75, (e2) => c3(e2, BigInt64Array, false), "sint64, big endian, Typed Array"), o2.registerDecoder(77, (e2) => c3(e2, Int16Array, true), "sint16, little endian, Typed Array"), ue(Int16Array, (e2, r3, n2) => l3(r3, 77, 73, e2, n2)), o2.registerDecoder(78, (e2) => c3(e2, Int32Array, true), "sint32, little endian, Typed Array"), ue(Int32Array, (e2, r3, n2) => l3(r3, 78, 74, e2, n2)), o2.registerDecoder(79, (e2) => c3(e2, BigInt64Array, true), "sint64, little endian, Typed Array"), ue(BigInt64Array, (e2, r3, n2) => l3(r3, 79, 75, e2, n2)), o2.registerDecoder(81, (e2) => c3(e2, Float32Array, false), "IEEE 754 binary32, big endian, Typed Array"), o2.registerDecoder(82, (e2) => c3(e2, Float64Array, false), "IEEE 754 binary64, big endian, Typed Array"), o2.registerDecoder(85, (e2) => c3(e2, Float32Array, true), "IEEE 754 binary32, little endian, Typed Array"), ue(Float32Array, (e2, r3, n2) => l3(r3, 85, 81, e2, n2)), o2.registerDecoder(86, (e2) => c3(e2, Float64Array, true), "IEEE 754 binary64, big endian, Typed Array"), ue(Float64Array, (e2, r3, n2) => l3(r3, 86, 82, e2, n2)), o2.registerDecoder(T.SET, (e2, r3) => {
  if (_2(e2.contents), r3.sortKeys) {
    const n2 = y4.decodeToEncodeOpts(r3);
    let i = null;
    for (const a4 of e2.contents) {
      const d5 = [a4, void 0, v2(a4, n2)];
      if (i && r3.sortKeys(i, d5) >= 0) throw new Error(`Set items out of order in tag #${T.SET}`);
      i = d5;
    }
  }
  return new Set(e2.contents);
}, "Set"), ue(Set, (e2, r3, n2) => {
  let i = [...e2];
  if (n2.sortKeys) {
    const a4 = i.map((d5) => [d5, void 0, v2(d5, n2)]);
    a4.sort(n2.sortKeys), i = a4.map(([d5]) => d5);
  }
  return [T.SET, i];
}), o2.registerDecoder(T.JSON, (e2) => (f7(e2.contents), JSON.parse(e2.contents)), "JSON-encoded");
function C(e2) {
  return E2(e2.contents), new Wtf8Decoder().decode(e2.contents);
}
C.comment = (e2) => {
  E2(e2.contents);
  const r3 = new Wtf8Decoder();
  return `(WTF8 string): ${JSON.stringify(r3.decode(e2.contents))}`;
}, o2.registerDecoder(T.WTF8, C), o2.registerDecoder(T.SELF_DESCRIBED, (e2) => e2.contents, "Self-Described"), o2.registerDecoder(T.INVALID_16, () => {
  throw new Error(`Tag always invalid: ${T.INVALID_16}`);
}, "Invalid"), o2.registerDecoder(T.INVALID_32, () => {
  throw new Error(`Tag always invalid: ${T.INVALID_32}`);
}, "Invalid"), o2.registerDecoder(T.INVALID_64, () => {
  throw new Error(`Tag always invalid: ${T.INVALID_64}`);
}, "Invalid"), o2.registerDecoder(T.SYMBOL, (e2) => {
  let r3 = e2.contents;
  if (Array.isArray(e2.contents)) {
    if (e2.contents.length !== 1) throw new Error(`Expected Array of size 1: ${e2.contents}`);
    [r3] = e2.contents;
  }
  if (f7(r3), !r3.length) throw new Error(`Expected non-empty string: ${e2.contents}`);
  return Symbol.for(r3);
}, "Symbol");
function h3(e2) {
  throw new Error(`Encoding ${e2.constructor.name} intentionally unimplmented.  It is not concrete enough to interoperate.  Convert to Uint8Array first.`);
}
ue(ArrayBuffer, h3), ue(DataView, h3), typeof SharedArrayBuffer < "u" && ue(SharedArrayBuffer, h3);
function p4(e2) {
  return [NaN, e2.valueOf()];
}
ue(Boolean, p4), ue(Number, p4), ue(String, p4), ue(BigInt, p4);

// node_modules/cbor2/lib/index.js
var { cdeDecodeOptions: r2, dcborDecodeOptions: n, defaultDecodeOptions: d4 } = y4;

// node_modules/@1sat/templates/node_modules/@1sat/types/dist/constants.js
var MAP_PREFIX = "1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5";
var ORD_LOCK_PREFIX = "2097dfd76851bf465e8f715593b217714858bbe9570ff3bd5e33840a34e20ff0262102ba79df5f8ae7604a9830f03c7933028186aede0675a16f025dc4f8be8eec0382201008ce7480da41702918d1ec8e6849ba32b4d65b1e40dc669c31a1e6306b266c0000";
var ORD_LOCK_SUFFIX = "615179547a75537a537a537a0079537a75527a527a7575615579008763567901c161517957795779210ac407f0e4bd44bfc207355a778b046225a7068fc59ee7eda43ad905aadbffc800206c266b30e6a1319c66dc401e5bd6b432ba49688eecd118297041da8074ce081059795679615679aa0079610079517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e01007e81517a75615779567956795679567961537956795479577995939521414136d08c5ed2bf3ba048afe6dcaebafeffffffffffffffffffffffffffffff00517951796151795179970079009f63007952799367007968517a75517a75517a7561527a75517a517951795296a0630079527994527a75517a6853798277527982775379012080517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e01205279947f7754537993527993013051797e527e54797e58797e527e53797e52797e57797e0079517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a756100795779ac517a75517a75517a75517a75517a75517a75517a75517a75517a7561517a75517a756169587951797e58797eaa577961007982775179517958947f7551790128947f77517a75517a75618777777777777777777767557951876351795779a9876957795779ac777777777777777767006868";
var LOCK_PREFIX = "2097dfd76851bf465e8f715593b217714858bbe9570ff3bd5e33840a34e20ff0262102ba79df5f8ae7604a9830f03c7933028186aede0675a16f025dc4f8be8eec0382201008ce7480da41702918d1ec8e6849ba32b4d65b1e40dc669c31a1e6306b266c0000";
var LOCK_SUFFIX = "610079040065cd1d9f690079547a75537a537a537a5179537a75527a527a7575615579014161517957795779210ac407f0e4bd44bfc207355a778b046225a7068fc59ee7eda43ad905aadbffc800206c266b30e6a1319c66dc401e5bd6b432ba49688eecd118297041da8074ce081059795679615679aa0079610079517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e01007e81517a75615779567956795679567961537956795479577995939521414136d08c5ed2bf3ba048afe6dcaebafeffffffffffffffffffffffffffffff00517951796151795179970079009f63007952799367007968517a75517a75517a7561527a75517a517951795296a0630079527994527a75517a6853798277527982775379012080517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e01205279947f7754537993527993013051797e527e54797e58797e527e53797e52797e57797e0079517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a756100795779ac517a75517a75517a75517a75517a75517a75517a75517a75517a7561517a75517a756169557961007961007982775179517954947f75517958947f77517a75517a756161007901007e81517a7561517a7561040065cd1d9f6955796100796100798277517951790128947f755179012c947f77517a75517a756161007901007e81517a7561517a756105ffffffff009f69557961007961007982775179517954947f75517958947f77517a75517a756161007901007e81517a7561517a75615279a2695679a95179876957795779ac7777777777777777";
var OPNS_CONTRACT = "0168016a2097dfd76851bf465e8f715593b217714858bbe9570ff3bd5e33840a34e20ff0262102ba79df5f8ae7604a9830f03c7933028186aede0675a16f025dc4f8be8eec0382201008ce7480da41702918d1ec8e6849ba32b4d65b1e40dc669c31a1e6306b266c00000000000000000116615179597a75587a587a587a587a587a587a587a587a0079587a75577a577a577a577a577a577a577a00577a75567a567a567a567a567a567a00567a75557a557a557a557a557a00557a75547a547a547a547a00547a75537a537a537a7575615c7961007901687f776100005279517f75007f77007901fd87635379537f75517f7761007901007e81517a7561537a75527a527a5379535479937f75537f77527a75517a67007901fe87635379557f75517f7761007901007e81517a7561537a75527a527a5379555479937f75557f77527a75517a67007901ff87635379597f75517f7761007901007e81517a7561537a75527a527a5379595479937f75597f77527a75517a675379517f75007f7761007901007e81517a7561537a75527a527a5379515479937f75517f77527a75517a6868685179517a75517a75517a75517a7561517a7561007961007982775179517951947f755179549451947f77007981527951799454945194517a75517a75517a75517a7561517951797f75537a75527a527a0000537953797f77610079537a75527a527a00527a75517a7561615179517951937f7551797f775179768b537a75527a527a75010051798791517a75610079916361005379005179557951937f7555797f77815579768b577a75567a567a567a567a567a567a750079014c9f630079547a75537a537a537a527956795579937f7556797f77527a75517a670079014c9c635279567951937f7556797f7761007901007e81517a7561547a75537a537a537a55795193567a75557a557a557a557a557a557975527956795579937f7556797f77527a75517a670079014d9c635279567952937f7556797f7761007901007e81517a7561547a75537a537a537a55795293567a75557a557a557a557a557a557975527956795579937f7556797f77527a75517a670079014e9c635279567954937f7556797f7761007901007e81517a7561547a75537a537a537a55795493567a75557a557a557a557a557a557975527956795579937f7556797f77527a75517a670069686868685579547993567a75557a557a557a557a557a5579755179517a75517a75517a75517a75615a7a75597a597a597a597a597a597a597a597a597a6161005379005179557951937f7555797f77815579768b577a75567a567a567a567a567a567a750079014c9f630079547a75537a537a537a527956795579937f7556797f77527a75517a670079014c9c635279567951937f7556797f7761007901007e81517a7561547a75537a537a537a55795193567a75557a557a557a557a557a557975527956795579937f7556797f77527a75517a670079014d9c635279567952937f7556797f7761007901007e81517a7561547a75537a537a537a55795293567a75557a557a557a557a557a557975527956795579937f7556797f77527a75517a670079014e9c635279567954937f7556797f7761007901007e81517a7561547a75537a537a537a55795493567a75557a557a557a557a557a557975527956795579937f7556797f77527a75517a670069686868685579547993567a75557a557a557a557a557a5579755179517a75517a75517a75517a75618161597a75587a587a587a587a587a587a587a587a61005379005179557951937f7555797f77815579768b577a75567a567a567a567a567a567a750079014c9f630079547a75537a537a537a527956795579937f7556797f77527a75517a670079014c9c635279567951937f7556797f7761007901007e81517a7561547a75537a537a537a55795193567a75557a557a557a557a557a557975527956795579937f7556797f77527a75517a670079014d9c635279567952937f7556797f7761007901007e81517a7561547a75537a537a537a55795293567a75557a557a557a557a557a557975527956795579937f7556797f77527a75517a670079014e9c635279567954937f7556797f7761007901007e81517a7561547a75537a537a537a55795493567a75557a557a557a557a557a557975527956795579937f7556797f77527a75517a670069686868685579547993567a75557a557a557a557a557a5579755179517a75517a75517a75517a7561587a75577a577a577a577a577a577a577a61005379005179557951937f7555797f77815579768b577a75567a567a567a567a567a567a750079014c9f630079547a75537a537a537a527956795579937f7556797f77527a75517a670079014c9c635279567951937f7556797f7761007901007e81517a7561547a75537a537a537a55795193567a75557a557a557a557a557a557975527956795579937f7556797f77527a75517a670079014d9c635279567952937f7556797f7761007901007e81517a7561547a75537a537a537a55795293567a75557a557a557a557a557a557975527956795579937f7556797f77527a75517a670079014e9c635279567954937f7556797f7761007901007e81517a7561547a75537a537a537a55795493567a75557a557a557a557a557a557975527956795579937f7556797f77527a75517a670069686868685579547993567a75557a557a557a557a557a5579755179517a75517a75517a75517a7561577a75567a567a567a567a567a567a6801117901c1615179011179011179210ac407f0e4bd44bfc207355a778b046225a7068fc59ee7eda43ad905aadbffc800206c266b30e6a1319c66dc401e5bd6b432ba49688eecd118297041da8074ce08100113795679615679aa0079610079517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e01007e81517a75615779567956795679567961537956795479577995939521414136d08c5ed2bf3ba048afe6dcaebafeffffffffffffffffffffffffffffff00517951796151795179970079009f63007952799367007968517a75517a75517a7561527a75517a517951795296a0630079527994527a75517a6853798277527982775379012080517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e01205279947f7754537993527993013051797e527e54797e58797e527e53797e52797e57797e0079517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a756100795779ac517a75517a75517a75517a75517a75517a75517a75517a75517a7561517a75517a75616959798277009c6301117961007901687f7501447f77517a756101207f75007f7701127961007901687f7501447f77517a756101207f778154807e5a7a75597a597a597a597a597a597a597a597a597a6801157901157961587952797e51797eaa007961007901007e81517a75610200015f799461007900a269517951796100517958968002010052795897987e81517a7561965179009c63527967527952974f9c6300795194675279009f630079009c670068634f670079686868517a75517a75517a75610079009c695179517a75517a75517a75517a7561577a75567a567a567a567a567a567a011579610079012d9c6400790130a2630079013a9f6700686751686400790161a2630079017b9f67006867516800796951527961007900a269517951796100517958968002010052795897987e81517a756195517a75517a75610079825d79827ba4766b807c6c808481009c695b79517993517a75517a75517a7561597a75587a587a587a587a587a587a587a587a51616100610079635167010068517a75615b796100798277005179014c9f63517951615179517951938000795179827751947f75007f77517a75517a75517a7561517a756751790200019f63014c527951615179517951938000795179827751947f75007f77517a75517a75517a75617e517a75675179030000019f63014d527952615179517951938000795179827751947f75007f77517a75517a75517a75617e517a756751790500000000019f63014e527954615179517951938000795179827751947f75007f77517a75517a75517a75617e517a7567006968686868007953797e517a75517a75517a75617e5a79610079009c630100670079686100798277005179014c9f63517951615179517951938000795179827751947f75007f77517a75517a75517a7561517a756751790200019f63014c527951615179517951938000795179827751947f75007f77517a75517a75517a75617e517a75675179030000019f63014d527952615179517951938000795179827751947f75007f77517a75517a75517a75617e517a756751790500000000019f63014e527954615179517951938000795179827751947f75007f77517a75517a75517a75617e517a7567006968686868007953797e517a75517a75517a7561517a75617e59796100798277005179014c9f63517951615179517951938000795179827751947f75007f77517a75517a75517a7561517a756751790200019f63014c527951615179517951938000795179827751947f75007f77517a75517a75517a75617e517a75675179030000019f63014d527952615179517951938000795179827751947f75007f77517a75517a75517a75617e517a756751790500000000019f63014e527954615179517951938000795179827751947f75007f77517a75517a75517a75617e517a7567006968686868007953797e517a75517a75517a75617e58796100798277005179014c9f63517951615179517951938000795179827751947f75007f77517a75517a75517a7561517a756751790200019f63014c527951615179517951938000795179827751947f75007f77517a75517a75517a75617e517a75675179030000019f63014d527952615179517951938000795179827751947f75007f77517a75517a75517a75617e517a756751790500000000019f63014e527954615179517951938000795179827751947f75007f77517a75517a75517a75617e517a7567006968686868007953797e517a75517a75517a75617e5779517961007982775480517951797e0051807e517a75517a75617e517a75610079527961007958805279610079827700517902fd009f63517951615179517951938000795179827751947f75007f77517a75517a75517a7561517a75675179030000019f6301fd527952615179517951938000795179827751947f75007f77517a75517a75517a75617e517a756751790500000000019f6301fe527954615179517951938000795179827751947f75007f77517a75517a75517a75617e517a75675179090000000000000000019f6301ff527958615179517951938000795179827751947f75007f77517a75517a75517a75617e517a7568686868007953797e517a75517a75517a75617e517a75517a7561517a75517a7561005a7a75597a597a597a597a597a597a597a597a597a58790117797e597a75587a587a587a587a587a587a587a587a51616100610079635167010068517a75615c796100798277005179014c9f63517951615179517951938000795179827751947f75007f77517a75517a75517a7561517a756751790200019f63014c527951615179517951938000795179827751947f75007f77517a75517a75517a75617e517a75675179030000019f63014d527952615179517951938000795179827751947f75007f77517a75517a75517a75617e517a756751790500000000019f63014e527954615179517951938000795179827751947f75007f77517a75517a75517a75617e517a7567006968686868007953797e517a75517a75517a75617e5b79610079009c630100670079686100798277005179014c9f63517951615179517951938000795179827751947f75007f77517a75517a75517a7561517a756751790200019f63014c527951615179517951938000795179827751947f75007f77517a75517a75517a75617e517a75675179030000019f63014d527952615179517951938000795179827751947f75007f77517a75517a75517a75617e517a756751790500000000019f63014e527954615179517951938000795179827751947f75007f77517a75517a75517a75617e517a7567006968686868007953797e517a75517a75517a7561517a75617e5a796100798277005179014c9f63517951615179517951938000795179827751947f75007f77517a75517a75517a7561517a756751790200019f63014c527951615179517951938000795179827751947f75007f77517a75517a75517a75617e517a75675179030000019f63014d527952615179517951938000795179827751947f75007f77517a75517a75517a75617e517a756751790500000000019f63014e527954615179517951938000795179827751947f75007f77517a75517a75517a75617e517a7567006968686868007953797e517a75517a75517a75617e59796100798277005179014c9f63517951615179517951938000795179827751947f75007f77517a75517a75517a7561517a756751790200019f63014c527951615179517951938000795179827751947f75007f77517a75517a75517a75617e517a75675179030000019f63014d527952615179517951938000795179827751947f75007f77517a75517a75517a75617e517a756751790500000000019f63014e527954615179517951938000795179827751947f75007f77517a75517a75517a75617e517a7567006968686868007953797e517a75517a75517a75617e5879517961007982775480517951797e0051807e517a75517a75617e517a75610079527961007958805279610079827700517902fd009f63517951615179517951938000795179827751947f75007f77517a75517a75517a7561517a75675179030000019f6301fd527952615179517951938000795179827751947f75007f77517a75517a75517a75617e517a756751790500000000019f6301fe527954615179517951938000795179827751947f75007f77517a75517a75517a75617e517a75675179090000000000000000019f6301ff527958615179517951938000795179827751947f75007f77517a75517a75517a75617e517a7568686868007953797e517a75517a75517a75617e517a75517a7561517a75517a7561011579615a795f79827700a0635b79012e7e60797e517a756851791a0063036f726451116170706c69636174696f6e2f6f702d6e73007e517982777e51797e0115797e0114797e01217e21316f704e53554a56624263325666384c464e536f797747474b346a4d63475672437e01247e5e797e517a75517a75615161007958805279610079827700517902fd009f63517951615179517951938000795179827751947f75007f77517a75517a75517a7561517a75675179030000019f6301fd527952615179517951938000795179827751947f75007f77517a75517a75517a75617e517a756751790500000000019f6301fe527954615179517951938000795179827751947f75007f77517a75517a75517a75617e517a75675179090000000000000000019f6301ff527958615179517951938000795179827751947f75007f77517a75517a75517a75617e517a7568686868007953797e517a75517a75517a75617e517a75517a7561527952797e51797e0116797e0079aa01167961007982775179517958947f7551790128947f77517a75517a7561877777777777777777777777777777777777777777777777777777";
var OPNS_GENESIS = "25cb9c17772641ba2374a8d74f729aad921932fef5e2c76642f279a38e55b75800000000";
var EXCHANGE_RATE_CACHE_TTL = 5 * 60 * 1e3;

// node_modules/@1sat/templates/node_modules/@1sat/types/dist/index.js
var TokenType;
(function(TokenType2) {
  TokenType2["BSV20"] = "bsv20";
  TokenType2["BSV21"] = "bsv21";
})(TokenType || (TokenType = {}));
var TokenSelectionStrategy;
(function(TokenSelectionStrategy2) {
  TokenSelectionStrategy2["SmallestFirst"] = "smallest";
  TokenSelectionStrategy2["LargestFirst"] = "largest";
  TokenSelectionStrategy2["RetainOrder"] = "retain";
  TokenSelectionStrategy2["Random"] = "random";
})(TokenSelectionStrategy || (TokenSelectionStrategy = {}));
var TokenInputMode;
(function(TokenInputMode2) {
  TokenInputMode2["All"] = "all";
  TokenInputMode2["Needed"] = "needed";
})(TokenInputMode || (TokenInputMode = {}));
var RoytaltyType;
(function(RoytaltyType2) {
  RoytaltyType2["Paymail"] = "paymail";
  RoytaltyType2["Address"] = "address";
  RoytaltyType2["Script"] = "script";
})(RoytaltyType || (RoytaltyType = {}));

// node_modules/@1sat/templates/dist/ordlock/ordlock.js
var ORDLOCK_PREFIX = utils_exports.toArray(ORD_LOCK_PREFIX, "hex");
var ORDLOCK_SUFFIX = utils_exports.toArray(ORD_LOCK_SUFFIX, "hex");

// node_modules/@1sat/templates/dist/opns/opns.js
var OPNS_CONTRACT_BYTES = utils_exports.toArray(OPNS_CONTRACT, "hex");
var OPNS_GENESIS_BYTES = utils_exports.toArray(OPNS_GENESIS, "hex");

// node_modules/@1sat/templates/dist/lock/lock.js
var LOCK_PREFIX2 = utils_exports.toArray(LOCK_PREFIX, "hex");
var LOCK_SUFFIX2 = utils_exports.toArray(LOCK_SUFFIX, "hex");

// node_modules/@1sat/templates/dist/bitcom/b.js
var MediaType;
(function(MediaType2) {
  MediaType2["TextPlain"] = "text/plain";
  MediaType2["TextMarkdown"] = "text/markdown";
  MediaType2["TextHTML"] = "text/html";
  MediaType2["ImagePNG"] = "image/png";
  MediaType2["ImageJPEG"] = "image/jpeg";
  MediaType2["ApplicationJSON"] = "application/json";
  MediaType2["ApplicationPDF"] = "application/pdf";
})(MediaType || (MediaType = {}));
var Encoding;
(function(Encoding2) {
  Encoding2["UTF8"] = "utf-8";
  Encoding2["Binary"] = "binary";
  Encoding2["Base64"] = "base64";
  Encoding2["Hex"] = "hex";
})(Encoding || (Encoding = {}));

// node_modules/@1sat/templates/dist/bitcom/bap.js
var BAPAttestationType;
(function(BAPAttestationType2) {
  BAPAttestationType2["ID"] = "ID";
  BAPAttestationType2["ATTEST"] = "ATTEST";
  BAPAttestationType2["REVOKE"] = "REVOKE";
  BAPAttestationType2["ALIAS"] = "ALIAS";
})(BAPAttestationType || (BAPAttestationType = {}));

// node_modules/@1sat/templates/dist/bitcom/map.js
var MAPCommand;
(function(MAPCommand2) {
  MAPCommand2["SET"] = "SET";
  MAPCommand2["DEL"] = "DEL";
  MAPCommand2["ADD"] = "ADD";
  MAPCommand2["SELECT"] = "SELECT";
})(MAPCommand || (MAPCommand = {}));

// node_modules/@1sat/templates/dist/bsocial/bsocial.js
var BSocialActionType;
(function(BSocialActionType2) {
  BSocialActionType2["POST"] = "post";
  BSocialActionType2["LIKE"] = "like";
  BSocialActionType2["UNLIKE"] = "unlike";
  BSocialActionType2["FOLLOW"] = "follow";
  BSocialActionType2["UNFOLLOW"] = "unfollow";
  BSocialActionType2["MESSAGE"] = "message";
  BSocialActionType2["VIDEO"] = "video";
})(BSocialActionType || (BSocialActionType = {}));
var BSocialContext;
(function(BSocialContext2) {
  BSocialContext2["TX"] = "tx";
  BSocialContext2["CHANNEL"] = "channel";
  BSocialContext2["BAP_ID"] = "bapID";
  BSocialContext2["PROVIDER"] = "provider";
  BSocialContext2["VIDEO_ID"] = "videoID";
  BSocialContext2["GEOHASH"] = "geohash";
  BSocialContext2["BTC_TX"] = "btcTx";
  BSocialContext2["ETH_TX"] = "ethTx";
})(BSocialContext || (BSocialContext = {}));

// node_modules/@1sat/templates/dist/bitcom/sigma.js
var { magicHash: magicHash2 } = BSM_exports;
var { toHex: toHex2, toArray: toArray3, toUTF8: toUTF82, toBase64: toBase642 } = utils_exports;
var SigmaAlgorithm;
(function(SigmaAlgorithm2) {
  SigmaAlgorithm2["BSM"] = "BSM";
  SigmaAlgorithm2["BRC77"] = "BRC77";
})(SigmaAlgorithm || (SigmaAlgorithm = {}));
var EMPTY_OUTPOINT = new Array(32).fill(0);

// src/protocol/collectionScript.ts
var COLLECTION_VERIFIER_REVISION = "brc100-r7-raw-sigma";
var uint32LE = (value) => [
  value & 255,
  value >> 8 & 255,
  value >> 16 & 255,
  value >> 24 & 255
];
var sigmaMessageHash = (lockingScript, input) => {
  if (!/^[0-9a-f]{64}$/i.test(input.txid) || !Number.isSafeInteger(input.vout) || input.vout < 0) {
    throw new Error("SIGMA requires a valid transaction outpoint.");
  }
  const inputHash = Hash_exports.sha256([
    ...utils_exports.toArray(input.txid, "hex"),
    ...uint32LE(input.vout)
  ]);
  const dataHash = Hash_exports.sha256(lockingScript.toBinary());
  return Hash_exports.sha256([...inputHash, ...dataHash]);
};
var parseRawScriptChunks = (lockingScript) => {
  const bytes2 = lockingScript.toBinary();
  const chunks = [];
  let cursor = 0;
  while (cursor < bytes2.length) {
    const start = cursor;
    const op = bytes2[cursor++];
    let length = null;
    let lengthBytes = 0;
    if (op > 0 && op < OP_default.OP_PUSHDATA1) {
      length = op;
    } else if (op === OP_default.OP_PUSHDATA1) {
      lengthBytes = 1;
    } else if (op === OP_default.OP_PUSHDATA2) {
      lengthBytes = 2;
    } else if (op === OP_default.OP_PUSHDATA4) {
      lengthBytes = 4;
    }
    if (lengthBytes > 0) {
      if (cursor + lengthBytes > bytes2.length) {
        chunks.push({ op, start, end: bytes2.length, invalidLength: true });
        break;
      }
      length = 0;
      for (let offset = 0; offset < lengthBytes; offset += 1) {
        length += bytes2[cursor + offset] * 2 ** (8 * offset);
      }
      cursor += lengthBytes;
    }
    if (length === null) {
      chunks.push({ op, start, end: cursor, invalidLength: false });
      continue;
    }
    const end = Math.min(cursor + length, bytes2.length);
    chunks.push({
      op,
      data: bytes2.slice(cursor, end),
      start,
      end,
      invalidLength: end - cursor !== length
    });
    cursor = end;
  }
  return chunks;
};
var chunkAscii = (chunks, index) => {
  const data = chunks[index]?.data;
  if (!data) return "";
  let value = "";
  for (const byte of data) value += String.fromCharCode(byte);
  return value;
};
var chunkEqualsAscii = (chunks, index, expected) => {
  const data = chunks[index]?.data;
  if (!data || data.length !== expected.length) return false;
  for (let offset = 0; offset < expected.length; offset += 1) {
    if (data[offset] !== expected.charCodeAt(offset)) return false;
  }
  return true;
};
var cleanMapString = (value) => value.replace(/\0/g, " ").replace(/\\u0000/g, " ");
function decodeMapSet(lockingScript) {
  const chunks = parseRawScriptChunks(lockingScript);
  for (let index = 0; index < chunks.length - 2; index += 1) {
    if (chunks[index]?.op !== OP_default.OP_RETURN || !chunkEqualsAscii(chunks, index + 1, MAP_PREFIX) || !chunkEqualsAscii(chunks, index + 2, "SET")) continue;
    const data = {};
    for (let cursor = index + 3; cursor < chunks.length; cursor += 2) {
      if (chunkEqualsAscii(chunks, cursor, "|")) return { cmd: "SET", data };
      const key = chunks[cursor]?.data;
      const value = chunks[cursor + 1]?.data;
      if (!key || !value) return null;
      data[cleanMapString(utils_exports.toUTF8(key))] = cleanMapString(utils_exports.toUTF8(value));
    }
    return { cmd: "SET", data };
  }
  return null;
}
function inspectSigmaSuffix(lockingScript) {
  const chunks = parseRawScriptChunks(lockingScript);
  let index = -1;
  for (let cursor = chunks.length - 1; cursor >= 1; cursor -= 1) {
    if (chunkEqualsAscii(chunks, cursor - 1, "|") && chunkEqualsAscii(chunks, cursor, "SIGMA") && chunkEqualsAscii(chunks, cursor + 1, "BSM")) {
      index = cursor;
      break;
    }
  }
  const markers = chunks.flatMap((_3, cursor) => {
    if (chunkEqualsAscii(chunks, cursor, "|")) return [`${cursor}:|`];
    if (chunkEqualsAscii(chunks, cursor, "SIGMA")) return [`${cursor}:SIGMA`];
    if (chunkEqualsAscii(chunks, cursor, "BSM")) return [`${cursor}:BSM`];
    return [];
  });
  const tailStart = Math.max(0, chunks.length - 10);
  const tail = chunks.slice(tailStart).map((chunk, offset) => {
    const cursor = tailStart + offset;
    const data = chunk.data;
    const bytes2 = data ? Array.from(data) : [];
    return `${cursor}:op=${chunk.op}:len=${bytes2.length}:hex=${utils_exports.toHex(bytes2.slice(0, 12)) || "-"}${chunk.invalidLength ? ":invalid" : ""}`;
  });
  return { index, markers, tail };
}
function extractUnsignedSigmaScript(lockingScript) {
  const sigma = inspectSigmaSuffix(lockingScript);
  if (sigma.index < 1) return null;
  const rawChunks = parseRawScriptChunks(lockingScript);
  const unsignedEnd = rawChunks[sigma.index - 1]?.start;
  return unsignedEnd === void 0 ? null : Script.fromBinary(lockingScript.toBinary().slice(0, unsignedEnd));
}
function verifyCollectionScript(lockingScript, expectedUnsignedScript, sigmaInput, expectedMap) {
  const errors = [];
  const sigma = inspectSigmaSuffix(lockingScript);
  const sigmaIndex = sigma.index;
  const rawChunks = parseRawScriptChunks(lockingScript);
  const decodedInscription = Inscription.decode(lockingScript);
  const decodedMap = decodeMapSet(lockingScript);
  let signerAddress = "";
  let signerPublicKey = "";
  if (!decodedInscription) errors.push("inscription not found");
  if (!decodedMap || decodedMap.cmd !== "SET") errors.push("MAP SET not found");
  if (decodedMap && JSON.stringify(decodedMap.data) !== JSON.stringify(expectedMap)) {
    errors.push("MAP fields do not match the canonical collection record");
  }
  if (sigmaIndex < 1) {
    errors.push(
      `SIGMA suffix not found [${COLLECTION_VERIFIER_REVISION}; markers=${sigma.markers.join(",") || "none"}; tail=${sigma.tail.join(",") || "empty"}]`
    );
  } else if (!chunkEqualsAscii(rawChunks, sigmaIndex + 1, "BSM") || !chunkEqualsAscii(rawChunks, sigmaIndex + 4, "0")) {
    errors.push("SIGMA fields are malformed");
  } else {
    signerAddress = chunkAscii(rawChunks, sigmaIndex + 2);
    const compact = rawChunks[sigmaIndex + 3]?.data;
    const unsignedEnd = rawChunks[sigmaIndex - 1]?.start ?? 0;
    const unsigned = Script.fromBinary(lockingScript.toBinary().slice(0, unsignedEnd));
    if (unsigned.toHex() !== expectedUnsignedScript.toHex()) {
      errors.push("signed output changed the inscription or MAP bytes");
    }
    try {
      if (!compact || compact.length !== 65) throw new Error("invalid compact signature");
      const messageHash = sigmaMessageHash(unsigned, sigmaInput);
      const bsmHash = BSM_exports.magicHash(messageHash);
      const publicKey = PublicKey.fromMsgHashAndCompactSignature(
        new BigNumber(bsmHash),
        compact
      );
      signerPublicKey = publicKey.toString();
      const signature = Signature.fromCompact(compact);
      if (publicKey.toAddress() !== signerAddress || !BSM_exports.verify(messageHash, signature, publicKey)) {
        errors.push("SIGMA signature is invalid");
      }
    } catch {
      errors.push("SIGMA signature is invalid");
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    signerAddress,
    signerPublicKey,
    map: decodedMap?.data ?? null,
    contentType: decodedInscription?.file.type ?? "",
    contentBytes: decodedInscription?.file.content.length ?? 0
  };
}

// src/protocol/scriptTemplates.ts
var ORDLOCK_PREFIX2 = utils_exports.toArray(
  "2097dfd76851bf465e8f715593b217714858bbe9570ff3bd5e33840a34e20ff0262102ba79df5f8ae7604a9830f03c7933028186aede0675a16f025dc4f8be8eec0382201008ce7480da41702918d1ec8e6849ba32b4d65b1e40dc669c31a1e6306b266c0000",
  "hex"
);
var ORDLOCK_SUFFIX_BYTES = 702;
var ORDLOCK_SUFFIX_SHA256 = "a208540ae84c8c389126731c9e69958a778e0bde2c2b4cbb4c1e3fe11973a1ad";
var equalBytes = (left, right) => left.length === right.length && left.every((byte, index) => byte === right[index]);
function decodeP2PKHScript(script) {
  const bytes2 = script.toBinary();
  if (bytes2.length !== 25 || bytes2[0] !== OP_default.OP_DUP || bytes2[1] !== OP_default.OP_HASH160 || bytes2[2] !== 20 || bytes2[23] !== OP_default.OP_EQUALVERIFY || bytes2[24] !== OP_default.OP_CHECKSIG) return null;
  const publicKeyHash = bytes2.slice(3, 23);
  return { address: utils_exports.toBase58Check(publicKeyHash, [0]), publicKeyHash };
}
function decodeEmbeddedP2PKHScript(script) {
  const matches = [];
  for (let index = 0; index <= script.chunks.length - 5; index += 1) {
    const match = decodeP2PKHScript(new Script(script.chunks.slice(index, index + 5)));
    if (match) matches.push(match);
  }
  return matches.length === 1 ? matches[0] : null;
}
function decodeOrdLockScript(script) {
  const bytes2 = script.toBinary();
  if (!equalBytes(bytes2.slice(0, ORDLOCK_PREFIX2.length), ORDLOCK_PREFIX2)) return null;
  let cursor = ORDLOCK_PREFIX2.length;
  if (bytes2[cursor] !== 20) return null;
  const sellerHash = bytes2.slice(cursor + 1, cursor + 21);
  if (sellerHash.length !== 20) return null;
  cursor += 21;
  const payoutLength = bytes2[cursor];
  if (payoutLength !== 34) return null;
  const payout = bytes2.slice(cursor + 1, cursor + 1 + payoutLength);
  if (payout.length !== payoutLength) return null;
  cursor += 1 + payoutLength;
  const suffix = bytes2.slice(cursor);
  if (suffix.length !== ORDLOCK_SUFFIX_BYTES || utils_exports.toHex(Hash_exports.sha256(suffix)) !== ORDLOCK_SUFFIX_SHA256) return null;
  let price = 0n;
  for (let offset = 0; offset < 8; offset += 1) {
    price |= BigInt(payout[offset]) << BigInt(offset * 8);
  }
  if (price < 1n || price > BigInt(Number.MAX_SAFE_INTEGER) || payout[8] !== 25) return null;
  const payoutScript = payout.slice(9);
  if (payoutScript.length !== 25 || !decodeP2PKHScript(Script.fromBinary(payoutScript))) return null;
  return {
    seller: utils_exports.toBase58Check(sellerHash, [0]),
    priceSatoshis: Number(price),
    payoutScript
  };
}

// src/onesat/constants.ts
var ORDINALS_BASKET = "p 1sat ordinals";
var ADINALS_BASKET = "adinals";
var TEST_ADINALS_BASKET = "adinals brc100 test";

// src/config/environment.ts
var viteEnv = import.meta.env ?? {};
var envText = (name) => typeof viteEnv[name] === "string" ? viteEnv[name].trim() : "";
var ADINALS_ENVIRONMENT = viteEnv.VITE_ADINALS_ENV === "development" ? "development" : "production";
var COLLECTION_PUBLISH_ENABLED = viteEnv.VITE_ENABLE_COLLECTION_PUBLISH !== "false";
var LIFECYCLE_PUBLISH_ENABLED = viteEnv.VITE_ENABLE_LIFECYCLE_PUBLISH !== "false";
var configuredOverlayUrl = envText("VITE_ADINALS_OVERLAY_URL").replace(/\/+$/, "");
var ADINALS_OVERLAY_URL = configuredOverlayUrl || (viteEnv.DEV === true && typeof window !== "undefined" ? new URL("/adinals-overlay", window.location.origin).toString().replace(/\/$/, "") : "");
var defaults = ADINALS_ENVIRONMENT === "production" ? {
  app: "adinals",
  basket: ADINALS_BASKET,
  keyProtocol: "adinals",
  actionLabel: "adinals action",
  messageBox: "adinals_inbox",
  overlayTopic: "tm_adinals"
} : {
  app: "adinals-brc100-test",
  basket: TEST_ADINALS_BASKET,
  keyProtocol: "adinals brc100 test",
  actionLabel: "adinals brc100 test action",
  messageBox: "adinals_brc100_test_inbox",
  overlayTopic: "tm_adinals_brc100_test"
};
var ADINALS_NAMESPACE = {
  environment: ADINALS_ENVIRONMENT,
  app: envText("VITE_ADINALS_APP") || defaults.app,
  basket: envText("VITE_ADINALS_BASKET") || defaults.basket,
  keyProtocol: envText("VITE_ADINALS_KEY_PROTOCOL") || defaults.keyProtocol,
  actionLabel: envText("VITE_ADINALS_ACTION_LABEL") || defaults.actionLabel,
  messageBox: envText("VITE_ADINALS_MESSAGEBOX") || defaults.messageBox,
  overlayTopic: envText("VITE_ADINALS_OVERLAY_TOPIC") || defaults.overlayTopic
};
var ACTIVE_BASKET_CANDIDATES = ADINALS_ENVIRONMENT === "production" ? [ORDINALS_BASKET, ADINALS_NAMESPACE.basket] : [ADINALS_NAMESPACE.basket];

// src/protocol/records.ts
var ADINALS_APP = ADINALS_NAMESPACE.app;

// src/readers/overlayReader.ts
var transactionPosition = (transaction) => {
  const path = transaction.merklePath;
  if (!path) return { height: null, index: 0 };
  const leaf = path.path[0]?.find((entry) => entry.hash === transaction.id("hex"));
  return { height: path.blockHeight, index: leaf?.offset ?? 0 };
};
var inspectOutput = (transaction, outputIndex) => {
  const output = transaction.outputs[outputIndex];
  const exactOutpoint = `${transaction.id("hex")}_${outputIndex}`;
  if (!output || output.satoshis !== 1) {
    throw new Error(`Overlay formula references a missing or non-one-satoshi output: ${exactOutpoint}`);
  }
  const txid = transaction.id("hex");
  const map = decodeMapSet(output.lockingScript)?.data ?? null;
  const inscription = Inscription.decode(output.lockingScript);
  let recordType;
  let signer = "";
  let owner = "";
  let listing = null;
  if (map) {
    if (map.subType !== "collection" && map.subType !== "collectionItem" && map.subType !== "adUpdate" && map.subType !== "adDecision") throw new Error("Overlay formula contains an unsupported Adinals record subtype.");
    if (!inscription) throw new Error("Overlay record is missing its inscription envelope.");
    const unsigned = extractUnsignedSigmaScript(output.lockingScript);
    const input = transaction.inputs[0];
    const sourceTxid = input?.sourceTXID ?? input?.sourceTransaction?.id("hex") ?? "";
    if (!unsigned || !sourceTxid || input?.sourceOutputIndex === void 0) {
      throw new Error("Overlay record is missing its SIGMA source evidence.");
    }
    const verification = verifyCollectionScript(
      output.lockingScript,
      unsigned,
      { txid: sourceTxid, vout: input.sourceOutputIndex },
      map
    );
    if (!verification.valid) {
      throw new Error(`Overlay record SIGMA verification failed: ${verification.errors.join("; ")}`);
    }
    recordType = map.subType;
    signer = verification.signerAddress;
    owner = decodeEmbeddedP2PKHScript(output.lockingScript)?.address ?? "";
    if (!owner) throw new Error("Overlay record has no unambiguous executable owner lock.");
  } else {
    const ordLock = decodeOrdLockScript(output.lockingScript);
    if (ordLock) {
      listing = { price: ordLock.priceSatoshis, seller: ordLock.seller };
      recordType = "listing";
      owner = listing.seller;
    } else {
      owner = decodeP2PKHScript(output.lockingScript)?.address ?? "";
      if (!owner) throw new Error(`Overlay lifecycle output has no recognized custody lock: ${exactOutpoint}`);
      recordType = "state";
    }
  }
  const position = transactionPosition(transaction);
  return {
    outpoint: `${txid}_${outputIndex}`,
    transaction,
    outputIndex,
    recordType,
    map,
    signer,
    owner,
    listing,
    contentType: inscription?.file.type ?? "",
    content: inscription ? [...inscription.file.content] : [],
    ...position
  };
};
async function readOverlayFormula(client2, query) {
  const formula = await client2.lookup(query);
  const records2 = [];
  const seen = /* @__PURE__ */ new Set();
  for (const candidate of formula.outputs) {
    if (!Number.isSafeInteger(candidate.outputIndex) || candidate.outputIndex < 0) {
      throw new Error("Overlay formula returned an invalid output index.");
    }
    let transaction;
    try {
      transaction = Transaction.fromBEEF(candidate.beef);
    } catch (error) {
      throw new Error(`Overlay formula BEEF could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const record = inspectOutput(transaction, candidate.outputIndex);
    if (seen.has(record.outpoint)) throw new Error("Overlay formula returned a duplicate output reference.");
    seen.add(record.outpoint);
    records2.push(record);
  }
  return records2;
}

// .heights-check.ts
var client = new AdinalsOverlayClient(
  "https://backend.93913ed6b421f18f80e669c61239a690.projects.babbage.systems",
  { topic: "tm_adinals" }
);
var records = await readOverlayFormula(client, {
  type: "collectionProjection",
  version: 1,
  origin: "ba4ad45336217b47fe0a48603a381d5c13bee854c41aa8eac6b6ab6d49008925_0"
});
var nulls = records.filter((r3) => r3.height === null);
console.log(`${records.length} records, ${nulls.length} without a height`);
for (const r3 of nulls) console.log("   still null:", String(r3.outpoint).slice(0, 12), r3.recordType);

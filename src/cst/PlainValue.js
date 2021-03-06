import { YAMLSemanticError } from '../errors.js'
import { Node } from './Node.js'
import { Range } from './Range.js'

export class PlainValue extends Node {
  static endOfLine(src, start, inFlow) {
    let ch = src[start]
    let offset = start
    while (ch && ch !== '\n') {
      if (
        inFlow &&
        (ch === '[' || ch === ']' || ch === '{' || ch === '}' || ch === ',')
      )
        break
      const next = src[offset + 1]
      if (
        ch === ':' &&
        (!next ||
          next === '\n' ||
          next === '\t' ||
          next === ' ' ||
          (inFlow && next === ','))
      )
        break
      if ((ch === ' ' || ch === '\t') && next === '#') break
      offset += 1
      ch = next
    }
    return offset
  }

  get strValue() {
    if (!this.valueRange || !this.context) return null
    let { start, end } = this.valueRange
    const { src } = this.context
    let ch = src[end - 1]
    while (start < end && (ch === '\n' || ch === '\t' || ch === ' '))
      ch = src[--end - 1]
    let str = ''
    for (let i = start; i < end; ++i) {
      const ch = src[i]
      if (ch === '\n') {
        const { fold, offset } = Node.foldNewline(src, i, -1)
        str += fold
        i = offset
      } else if (ch === ' ' || ch === '\t') {
        // trim trailing whitespace
        const wsStart = i
        let next = src[i + 1]
        while (i < end && (next === ' ' || next === '\t')) {
          i += 1
          next = src[i + 1]
        }
        if (next !== '\n') str += i > wsStart ? src.slice(wsStart, i + 1) : ch
      } else {
        str += ch
      }
    }
    const ch0 = src[start]
    switch (ch0) {
      case '\t': {
        const msg = 'Plain value cannot start with a tab character'
        const errors = [new YAMLSemanticError(this, msg)]
        return { errors, str }
      }
      case '@':
      case '`': {
        const msg = `Plain value cannot start with reserved character ${ch0}`
        const errors = [new YAMLSemanticError(this, msg)]
        return { errors, str }
      }
      default:
        return str
    }
  }

  parseBlockValue(start) {
    const { indent, inFlow, src } = this.context
    let offset = start
    let valueEnd = start
    for (let ch = src[offset]; ch === '\n'; ch = src[offset]) {
      if (Node.atDocumentBoundary(src, offset + 1)) break
      const end = Node.endOfBlockIndent(src, indent, offset + 1)
      if (end === null || src[end] === '#') break
      if (src[end] === '\n') {
        offset = end
      } else {
        valueEnd = PlainValue.endOfLine(src, end, inFlow)
        offset = valueEnd
      }
    }
    if (this.valueRange.isEmpty()) this.valueRange.start = start
    this.valueRange.end = valueEnd
    trace: this.valueRange, JSON.stringify(this.rawValue)
    return valueEnd
  }

  /**
   * Parses a plain value from the source
   *
   * Accepted forms are:
   * ```
   * #comment
   *
   * first line
   *
   * first line #comment
   *
   * first line
   * block
   * lines
   *
   * #comment
   * block
   * lines
   * ```
   * where block lines are empty or have an indent level greater than `indent`.
   *
   * @param {ParseContext} context
   * @param {number} start - Index of first character
   * @returns {number} - Index of the character after this scalar, may be `\n`
   */
  parse(context, start) {
    this.context = context
    trace: 'plain-start', context.pretty, { start }
    const { inFlow, src } = context
    let offset = start
    const ch = src[offset]
    if (ch && ch !== '#' && ch !== '\n') {
      offset = PlainValue.endOfLine(src, start, inFlow)
    }
    this.valueRange = new Range(start, offset)
    offset = Node.endOfWhiteSpace(src, offset)
    offset = this.parseComment(offset)
    trace: 'first line',
      { offset, valueRange: this.valueRange, comment: this.comment },
      JSON.stringify(this.rawValue)
    if (!this.hasComment || this.valueRange.isEmpty()) {
      offset = this.parseBlockValue(offset)
    }
    trace: this.type,
      { offset, valueRange: this.valueRange },
      JSON.stringify(this.rawValue)
    return offset
  }
}

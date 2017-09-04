/* eslint-disable no-console */
import chalk from 'chalk'
import { relative } from 'path'
import flatten from 'lodash.flatten'
import codeFrame from 'babel-code-frame'


export default function (babel) {
  const { types: t } = babel

  function getCalleeMeta(node) {
    const { callee } = node
    let name

    if (t.isIdentifier(callee)) {
      name = callee.name
    } else if (t.isMemberExpression(callee)) {
      let obj = callee.object
      while (!obj.name) {
        obj = obj.object
      }
      name = obj.name
    }

    return { name, loc: callee.loc.start }
  }

  function getNameFromObjectPattern(node) {
    return t.isObjectPattern(node)
      ? node.properties.map((prop) => {
        if (t.isObjectPattern(prop.value)) {
          return getNameFromObjectPattern(prop.value)
        } else if (t.Identifier(prop.value)) {
          return prop.value.name
        }
        return null
      })
      : null
  }

  function getEffectAndActionNames(params) {
    const names = params.map((param) => {
      if (t.isIdentifier(param)) {
        return param.name
      }
      return getNameFromObjectPattern(param)
    })

    return flatten(names, true)
  }

  function visitCallExpression(paramNames, path) {
    if (!t.isYieldExpression(path.parent)) {
      const { name, loc } = getCalleeMeta(path.node)
      // is effect or action call
      if (paramNames.includes(name)) {
        const { filename } = path.hub.file.opts
        const filepath = `./${relative(process.cwd(), filename)}`

        console.log()
        console.log(chalk.inverse(filepath))
        console.log(`Probably missing \`yield\` at method calling. (${loc.line}:${loc.column})`)

        const code = codeFrame(path.hub.file.code, loc.line, loc.column, { highlightCode: true })
        console.log()
        console.log(code)
        console.log()
        console.log()
      }
    }
  }

  function visitMethod(path) {
    const node = path.node
    let params
    let generator = false

    if (t.isObjectMethod(node)) {
      generator = node.generator
      params = node.params
    } else if (t.isObjectProperty(node)) {
      const val = node.value
      if (t.isFunctionExpression(val) && val.generator) {
        generator = true
        params = val.params
      }
    }

    if (generator) {
      const paramNames = getEffectAndActionNames(params.slice(1))
      path.get('body').traverse({
        CallExpression: visitCallExpression.bind(null, paramNames),
      })
    }
  }

  return {
    visitor: {
      'ObjectMethod|ObjectProperty': visitMethod,
    },
  }
}

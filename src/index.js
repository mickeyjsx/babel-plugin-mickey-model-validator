/* eslint-disable no-console */
import chalk from 'chalk'
import { relative } from 'path'
import codeFrame from 'babel-code-frame'


export default function (babel) {
  const { types: t } = babel

  function isGenerator(node) {
    if (t.isObjectMethod(node)) {
      return node.generator
    } else if (t.isObjectProperty(node)) {
      const value = node.value
      return t.isFunctionExpression(value) && value.generator
    }

    return false
  }

  function getCalleeMeta(node) {
    const { callee } = node
    let name
    let loc
    if (t.isIdentifier(callee)) {
      name = callee.name
      loc = callee.loc.start
    } else if (t.isMemberExpression(callee)) {
      let obj = callee.object
      while (!obj.name) {
        obj = obj.object
      }
      name = obj.name
      loc = obj.loc.start
    }

    return { name, loc }
  }

  const bodyVisitor = {
    CallExpression(path) {
      if (!t.isYieldExpression(path.parent)) {
        const { name, loc } = getCalleeMeta(path.node)
        if (path.scope.hasOwnBinding(name)) {
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
    },
  }

  return {
    visitor: {
      'ObjectMethod|ObjectProperty': (path) => {
        if (isGenerator(path.node)) {
          path.get('body').traverse(bodyVisitor)
        }
      },
    },
  }
}

/* eslint-disable no-console */
import chalk from 'chalk'
import { relative } from 'path'
import flatten from 'lodash.flatten'
import codeFrame from '@babel/code-frame'


export default function (babel) {
  const { types: t, transform } = babel

  // Cache the bad code's loc, when exit exportDefaultDeclaration
  // inject `console.warn(...)` after `export default` statement.
  // Could not inject `console.warn(...)` just at the place where
  // the bad code located, because the bad code may would not be
  // executed after module loaded.
  let cache = null

  function getWarnMessage(loc) {
    return `Probably missing "yield" keyword at method calling. (${loc.line}:${loc.column})`
  }

  function getCalleeMeta(node) {
    const { callee } = node
    let name

    if (t.isIdentifier(callee)) {
      name = callee.name
    } else if (t.isMemberExpression(callee)) {
      let obj = callee.object
      if (t.isCallExpression(obj)) {
        name = getCalleeMeta(obj).name
      } else {
        while (obj && !obj.name) {
          obj = obj.object
        }
        if (obj) {
          name = obj.name
        }
      }
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
        console.log(getWarnMessage(loc))

        const code = codeFrame(path.hub.file.code, loc.line, loc.column, { highlightCode: true })
        console.log()
        console.log(code)
        console.log()
        console.log()

        if (process.env.NODE_ENV !== 'production' && cache) {
          cache.push({
            file: filepath,
            loc,
          })
        }
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

  const visitor = {
    'ObjectMethod|ObjectProperty': visitMethod,
  }

  if (process.env.NODE_ENV !== 'production') {
    visitor.ExportDefaultDeclaration = {
      enter() {
        cache = []
      },
      exit(path) {
        if (cache && cache.length) {
          cache.forEach(({ file, loc }) => {
            const code = codeFrame(path.hub.file.code, loc.line, loc.column)
            const raw = `console.warn('${file} \\n${getWarnMessage(loc)} \\n\\n${code.split('\n').join('\\n')}\\n ')`
            const ret = transform(raw, {
              code: true,
              babelrc: false,
            })
            path.insertAfter(ret.ast.program.body[0])
          })
        }
      },
    }
  }

  return { visitor }
}

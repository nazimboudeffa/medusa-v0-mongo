import { createContainer, asValue } from "awilix"
import expressLoader from "./express"
import mongooseLoader from "./mongoose"
import apiLoader from "./api"
import modelsLoader from "./models"
import servicesLoader from "./services"
import passportLoader from "./passport"
import pluginsLoader from "./plugins"
import Logger from "./logger"

export default async ({ expressApp }) => {
  const container = createContainer()
  container.registerAdd = function(name, registration) {
    let storeKey = name + "_STORE"

    if (this.registrations[storeKey] === undefined) {
      this.register(storeKey, asValue([]))
    }
    let store = this.resolve(storeKey)

    if (this.registrations[name] === undefined) {
      this.register(name, asArray(store))
    }
    store.unshift(registration)

    return this
  }.bind(container)

  container.register({
    logger: asValue(Logger),
  })

  await modelsLoader({ container })
  Logger.info("Models initialized")

  await servicesLoader({ container })
  Logger.info("Services initialized")

  await pluginsLoader({ container })
  Logger.info("Plugins Intialized")

  await mongooseLoader()
  Logger.info("MongoDB Intialized")

  await expressLoader({ app: expressApp })
  Logger.info("Express Intialized")

  await passportLoader({ app: expressApp, container })
  Logger.info("Passport initialized")

  // Add the registered services to the request scope
  expressApp.use((req, res, next) => {
    req.scope = container.createScope()
    next()
  })

  await apiLoader({ app: expressApp })
  Logger.info("API initialized")
}

function asArray(resolvers) {
  return {
    resolve: (container, opts) => resolvers.map(r => container.build(r, opts)),
  }
}

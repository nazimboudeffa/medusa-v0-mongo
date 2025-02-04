import { Router } from "express"
import middlewares from "../../../middlewares"

const route = Router()

export default app => {
  app.use("/products", route)

  route.get("/", middlewares.wrap(require("./list-products").default))
  route.get("/:productId", middlewares.wrap(require("./get-product").default))

  return app
}

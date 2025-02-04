import { createContainer, asValue } from "awilix"
import PaymentProviderService from "../payment-provider"

describe("ProductService", () => {
  describe("retrieveProvider", () => {
    const container = createContainer()

    container.register({
      pp_default_provider: asValue("good"),
    })

    const providerService = new PaymentProviderService(container)

    it("successfully retrieves payment provider", () => {
      const provider = providerService.retrieveProvider("default_provider")
      expect(provider).toEqual("good")
    })

    it("fails when payment provider not found", () => {
      try {
        providerService.retrieveProvider("unregistered")
      } catch (err) {
        expect(err.message).toEqual(
          "Could not find a payment provider with id: unregistered"
        )
      }
    })
  })
})

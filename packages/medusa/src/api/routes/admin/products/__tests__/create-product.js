import { IdMap } from "medusa-test-utils"
import { request } from "../../../../../helpers/test-request"
import { ProductServiceMock } from "../../../../../services/__mocks__/product"

describe("POST /admin/products", () => {
  describe("successful creation", () => {
    let subject

    beforeAll(async () => {
      subject = await request("POST", "/admin/products", {
        payload: {
          title: "Test Product",
          description: "Test Description",
          tags: "hi,med,dig",
          handle: "test-product",
        },
        adminSession: {
          jwt: {
            userId: IdMap.getId("admin_user"),
          },
        },
      })
    })

    it("returns 200", () => {
      expect(subject.status).toEqual(201)
    })

    it("returns created product draft", () => {
      expect(subject.body).toEqual({
        title: "Test Product",
        description: "Test Description",
        tags: "hi,med,dig",
        handle: "test-product",
      })
    })

    it("calls service createDraft", () => {
      expect(ProductServiceMock.createDraft).toHaveBeenCalledTimes(1)
      expect(ProductServiceMock.createDraft).toHaveBeenCalledWith({
        title: "Test Product",
        description: "Test Description",
        tags: "hi,med,dig",
        handle: "test-product",
      })
    })
  })

  describe("invalid data returns error details", () => {
    let subject

    beforeAll(async () => {
      subject = await request("POST", "/admin/products", {
        payload: {
          description: "Test Description",
          tags: "hi,med,dig",
          handle: "test-product",
        },
        adminSession: {
          jwt: {
            userId: IdMap.getId("admin_user"),
          },
        },
      })
    })

    it("returns 400", () => {
      expect(subject.status).toEqual(400)
    })

    it("returns error details", () => {
      expect(subject.body.name).toEqual("invalid_data")
      expect(subject.body.message[0].message).toEqual(`"title" is required`)
    })
  })
})

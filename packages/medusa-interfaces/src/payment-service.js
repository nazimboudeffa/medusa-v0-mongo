import BaseService from "./base-service"

/**
 * The interface that all payment services must inherit from. The intercace
 * provides the necessary methods for creating, authorizing and managing
 * payments.
 * @interface
 */
class BasePaymentService extends BaseService {
  constructor() {
    super()
  }

  /**
   * Used to create a payment to be processed with the service's payment gateway.
   * @param cart {object} - the cart that the payment should cover.
   * @return {Promise<{object}>} - returns a promise that resolves to an object
   * containing the payment data. This data will be saved to the cart for later
   * use.
   */
  createPayment(cart) {
    throw Error("createPayment must be overridden by the child class")
  }

  /**
   * Used to retrieve a payment.
   * @param cart {object} - the cart whose payment should be retrieved.
   * @return {Promise<{object}>} - returns a promise that resolves to the
   * payment object as stored with the provider.
   */
  retrievePayment(cart) {
    throw Error("getPayment must be overridden by the child class")
  }

  /**
   * Used to update a payment. This method is called when the cart is updated.
   * @param cart {object} - the cart whose payment should be updated.
   * @return {Promise<{object}>} - returns a promise that resolves to the
   * payment object as stored with the provider.
   */
  updatePayment(cart) {
    throw Error("updatePayment must be overridden by the child class")
  }

  getStatus() {
    throw Error("getStatus must be overridden by the child class")
  }

  authorizePayment() {
    throw Error("authorizePayment must be overridden by the child class")
  }

  capturePayment() {
    throw Error("capturePayment must be overridden by the child class")
  }

  refundPayment() {
    throw Error("refundPayment must be overridden by the child class")
  }

  deletePayment() {
    throw Error("deletePayment must be overridden by the child class")
  }
}

export default BasePaymentService

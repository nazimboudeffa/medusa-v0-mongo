import _ from "lodash"
import { Validator, MedusaError } from "medusa-core-utils"
import { BaseService } from "medusa-interfaces"

/**
 * Provides layer to manipulate carts.
 * @implements BaseService
 */
class CartService extends BaseService {
  constructor({
    cartModel,
    eventBusService,
    paymentProviderService,
    productService,
    productVariantService,
    regionService,
    lineItemService,
    shippingOptionService,
  }) {
    super()

    /** @private @const {CartModel} */
    this.cartModel_ = cartModel

    /** @private @const {EventBus} */
    this.eventBus_ = eventBusService

    /** @private @const {ProductVariantService} */
    this.productVariantService_ = productVariantService

    /** @private @const {ProductService} */
    this.productService_ = productService

    /** @private @const {RegionService} */
    this.regionService_ = regionService

    /** @private @const {LineItemService} */
    this.lineItemService_ = lineItemService

    /** @private @const {PaymentProviderService} */
    this.paymentProviderService_ = paymentProviderService

    /** @private @const {ShippingOptionsService} */
    this.shippingOptionService_ = shippingOptionService
  }

  /**
   * Used to validate cart ids. Throws an error if the cast fails
   * @param {string} rawId - the raw cart id to validate.
   * @return {string} the validated id
   */
  validateId_(rawId) {
    const schema = Validator.objectId()
    const { value, error } = schema.validate(rawId)
    if (error) {
      throw new MedusaError(
        MedusaError.Types.INVALID_ARGUMENT,
        "The cartId could not be casted to an ObjectId"
      )
    }

    return value
  }

  /**
   * Contents of a line item
   * @typedef {(object | array)} LineItemContent
   * @property {number} unit_price - the price of the content
   * @property {object} variant - the product variant of the content
   * @property {object} product - the product of the content
   * @property {number} quantity - the quantity of the content
   */

  /**
   * A collection of contents grouped in the same line item
   * @typedef {LineItemContent[]} LineItemContentArray
   */

  /**
   * Confirms if the contents of a line item is covered by the inventory.
   * To be covered a variant must either not have its inventory managed or it
   * must allow backorders or it must have enough inventory to cover the request.
   * If the content is made up of multiple variants it will return true if all
   * variants can be covered. If the content consists of a single variant it will
   * return true if the variant is covered.
   * @param {(LineItemContent | LineItemContentArray)} - the content of the line
   *     item
   * @param {number} - the quantity of the line item
   * @return {boolean} true if the inventory covers the line item.
   */
  async confirmInventory_(content, lineQuantity) {
    if (Array.isArray(content)) {
      const coverage = await Promise.all(
        content.map(({ variant, quantity }) => {
          return this.productVariantService_.canCoverQuantity(
            variant._id,
            lineQuantity * quantity
          )
        })
      )

      return coverage.every(c => c)
    }

    const { variant, quantity } = content
    return this.productVariantService_.canCoverQuantity(
      variant._id,
      lineQuantity * quantity
    )
  }

  /**
   * Transforms some line item content to have unit_prices corresponding to a
   * given region's pricing scheme.
   * @param {(LineItemContent | LineItemContentArray)} - the content of the line
   *    item
   * @param {string} regionId - the id of the region whose price we should
   *    update to
   * @return {(LineItemContent | LineItemContentArray)} true if the inventory
   *    covers the line item.
   */
  async updateContentPrice_(content, regionId) {
    if (Array.isArray(content)) {
      return await Promise.all(
        content.map(async c => {
          const unitPrice = await this.productVariantService_.getRegionPrice(
            c.variant._id,
            regionId
          )
          c.unit_price = unitPrice
          return c
        })
      )
    }

    const unitPrice = await this.productVariantService_.getRegionPrice(
      content.variant._id,
      regionId
    )
    content.unit_price = unitPrice
    return content
  }

  /**
   * @param {Object} selector - the query object for find
   * @return {Promise} the result of the find operation
   */
  list(selector) {
    return this.cartModel_.find(selector)
  }

  /**
   * Gets a cart by id.
   * @param {string} cartId - the id of the cart to get.
   * @return {Promise<Cart>} the cart document.
   */
  async retrieve(cartId) {
    const validatedId = this.validateId_(cartId)
    const cart = await this.cartModel_
      .findOne({ _id: validatedId })
      .catch(err => {
        throw new MedusaError(MedusaError.Types.DB_ERROR, err.message)
      })

    if (!cart) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Cart with ${cartId} was not found`
      )
    }
    return cart
  }

  /**
   * Creates a cart.
   * @param {Object} data - the data to create the cart with
   * @return {Promise} the result of the create operation
   */
  async create(data) {
    const { region_id } = data
    if (!region_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `A region_id must be provided when creating a cart`
      )
    }

    const region = await this.regionService_.retrieve(region_id)

    return this.cartModel_
      .create({
        region_id: region._id,
      })
      .catch(err => {
        throw new MedusaError(MedusaError.Types.DB_ERROR, err.message)
      })
  }

  /**
   * Decorates a cart.
   * @param {Cart} cart - the cart to decorate.
   * @param {string[]} fields - the fields to include.
   * @param {string[]} expandFields - fields to expand.
   * @return {Cart} return the decorated cart.
   */
  async decorate(cart, fields, expandFields = []) {
    return cart
  }

  /**
   * Adds a line item to the cart.
   * @param {string} cartId - the id of the cart that we will add to
   * @param {LineItem} lineItem - the line item to add.
   * @retur {Promise} the result of the update operation
   */
  async addLineItem(cartId, lineItem) {
    const validatedLineItem = this.lineItemService_.validate(lineItem)
    const cart = await this.retrieve(cartId)
    const currentItem = cart.items.find(line =>
      _.isEqual(line.content, validatedLineItem.content)
    )

    // If content matches one of the line items currently in the cart we can
    // simply update the quantity of the existing line item
    if (currentItem) {
      const newQuantity = currentItem.quantity + validatedLineItem.quantity

      // Confirm inventory
      const hasInventory = await this.confirmInventory_(
        validatedLineItem.content,
        newQuantity
      )

      if (!hasInventory) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Inventory doesn't cover the desired quantity"
        )
      }

      return this.cartModel_.updateOne(
        {
          _id: cartId,
          "items._id": currentItem._id,
        },
        {
          $set: {
            "items.$.quantity": newQuantity,
          },
        }
      )
    }

    // Confirm inventory
    const hasInventory = await this.confirmInventory_(
      validatedLineItem.content,
      validatedLineItem.quantity
    )

    if (!hasInventory) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Inventory doesn't cover the desired quantity"
      )
    }

    // The line we are adding doesn't already exist so it is safe to push
    return this.cartModel_.updateOne(
      {
        _id: cartId,
      },
      {
        $push: { items: validatedLineItem },
      }
    )
  }

  /**
   * Updates a cart's existing line item.
   * @param {string} cartId - the id of the cart to update
   * @param {string} lineItemId - the id of the line item to update.
   * @param {LineItem} lineItem - the line item to update. Must include an _id
   *    field.
   * @return {Promise} the result of the update operation
   */
  async updateLineItem(cartId, lineItemId, lineItem) {
    const cart = await this.retrieve(cartId)
    const validatedLineItem = this.lineItemService_.validate(lineItem)

    if (!lineItemId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Line Item must have an _id corresponding to an existing line item id"
      )
    }

    // Ensure that the line item exists in the cart
    const lineItemExists = cart.items.find(i => i._id === lineItemId)
    if (!lineItemExists) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A line item with the provided id doesn't exist in the cart"
      )
    }

    // Ensure that inventory covers the request
    const hasInventory = await this.confirmInventory_(
      validatedLineItem.content,
      validatedLineItem.quantity
    )

    if (!hasInventory) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Inventory doesn't cover the desired quantity"
      )
    }

    // Update the line item
    return this.cartModel_.updateOne(
      {
        _id: cartId,
        "items._id": lineItemId,
      },
      {
        $set: {
          "items.$": validatedLineItem,
        },
      }
    )
  }

  /**
   * Sets the email of a cart
   * @param {string} cartId - the id of the cart to add email to
   * @param {string} email - the email to add to cart
   * @return {Promise} the result of the update operation
   */
  async updateEmail(cartId, email) {
    const cart = await this.retrieve(cartId)
    const schema = Validator.string()
      .email()
      .required()
    const { value, error } = schema.validate(email)
    if (error) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "The email is not valid"
      )
    }

    return this.cartModel_.updateOne(
      {
        _id: cart._id,
      },
      {
        $set: { email: value },
      }
    )
  }

  /**
   * Updates the cart's billing address.
   * @param {string} cartId - the id of the cart to update
   * @param {object} address - the value to set the billing address to
   * @return {Promise} the result of the update operation
   */
  async updateBillingAddress(cartId, address) {
    const cart = await this.retrieve(cartId)
    const { value, error } = Validator.address().validate(address)
    if (error) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "The address is not valid"
      )
    }

    return this.cartModel_.updateOne(
      {
        _id: cart._id,
      },
      {
        $set: { billing_address: value },
      }
    )
  }

  /**
   * Updates the cart's shipping address.
   * @param {string} cartId - the id of the cart to update
   * @param {object} address - the value to set the shipping address to
   * @return {Promise} the result of the update operation
   */
  async updateShippingAddress(cartId, address) {
    const cart = await this.retrieve(cartId)
    const { value, error } = Validator.address().validate(address)
    if (error) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "The address is not valid"
      )
    }

    return this.cartModel_.updateOne(
      {
        _id: cartId,
      },
      {
        $set: { shipping_address: value },
      }
    )
  }

  /**
   * A payment method represents a way for the customer to pay. The payment
   * method will typically come from one of the payment sessions.
   * @typedef {object} PaymentMethod
   * @property {string} provider_id - the identifier of the payment method's
   *     provider
   * @property {object} data - the data associated with the payment method
   */

  /**
   * Retrieves an open payment session from the list of payment sessions
   * stored in the cart. If none is an INVALID_DATA error is thrown.
   * @param {string} cartId - the id of the cart to retrieve the session from
   * @param {string} providerId - the id of the provider the session belongs to
   * @return {PaymentMethod} the session
   */
  async retrievePaymentSession(cartId, providerId) {
    const cart = await this.retrieve(cartId)
    const session = cart.payment_sessions.find(
      ({ provider_id }) => provider_id === providerId
    )

    if (!session) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `The provider_id did not match any open payment sessions`
      )
    }

    return session
  }

  /**
   * Sets a payment method for a cart.
   * @param {string} cartId - the id of the cart to add payment method to
   * @param {PaymentMethod} paymentMethod - the method to be set to the cart
   * @returns {Promise} result of update operation
   */
  async setPaymentMethod(cartId, paymentMethod) {
    const cart = await this.retrieve(cartId)
    const region = await this.regionService_.retrieve(cart.region_id)

    // The region must have the provider id in its providers array
    if (
      !(
        region.payment_providers.length &&
        region.payment_providers.includes(paymentMethod.provider_id)
      )
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `The payment method is not available in this region`
      )
    }

    // The provider service will be able to perform operations on the
    // session we are trying to set as the payment method.
    const provider = this.paymentProviderService_.retrieveProvider(
      paymentMethod.provider_id
    )

    const status = await provider.getStatus(paymentMethod.data)
    if (status !== "authorized") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `The payment method was not authorized`
      )
    }

    // At this point we can register the payment method.
    return this.cartModel_.updateOne(
      {
        _id: cart._id,
      },
      {
        $set: { payment_method: paymentMethod },
      }
    )
  }

  /**
   * Creates, updates and sets payment sessions associated with the cart. The
   * first time the method is called payment sessions will be created for each
   * provider. Additional calls will ensure that payment sessions have correct
   * amounts, currencies, etc. as well as make sure to filter payment sessions
   * that are not available for the cart's region.
   * @param {string} cartId - the id of the cart to set payment session for
   * @returns {Promise} the result of the update operation.
   */
  async setPaymentSessions(cartId) {
    const cart = await this.retrieve(cartId)
    const region = await this.regionService_.retrieve(cart.region_id)

    // If there are existing payment sessions ensure that these are up to date
    let sessions = []
    if (cart.payment_sessions && cart.payment_sessions.length) {
      sessions = await Promise.all(
        cart.payment_sessions.map(async pSession => {
          if (!region.payment_providers.includes(pSession.provider_id)) {
            return null
          }
          return this.paymentProviderService_.updateSession(pSession, cart)
        })
      )
    }

    // Filter all null sessions
    sessions = sessions.filter(s => !!s)

    // For all the payment providers in the region make sure to either skip them
    // if they already exist or create them if they don't yet exist.
    let newSessions = await Promise.all(
      region.payment_providers.map(async pId => {
        if (sessions.find(s => s.provider_id === pId)) {
          return null
        }

        return this.paymentProviderService_.createSession(pId, cart)
      })
    )

    // Filter null sessions
    newSessions = newSessions.filter(s => !!s)

    // Update the payment sessions with the concatenated array of updated and
    // newly created payment sessions
    return this.cartModel_.updateOne(
      {
        _id: cart._id,
      },
      {
        $set: { payment_sessions: sessions.concat(newSessions) },
      }
    )
  }

  /**
   * Retrieves one of the open shipping options for the cart.
   * @param {string} cartId - the id of the cart to retrieve the option from
   * @param {string} optionId - the id of the option to retrieve
   * @return {ShippingOption} the option that was found
   */
  async retrieveShippingOption(cartId, optionId) {
    const cart = await this.retrieve(cartId)

    const option = cart.shipping_options.find(({ _id }) => _id === optionId)

    if (!option) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `The option id doesn't match any available shipping options`
      )
    }

    return option
  }

  /**
   * Adds the shipping method to the list of shipping methods associated with
   * the cart.
   * @param {string} cartId - the id of the cart to add shipping method to
   * @param {ShippingOption} method - the shipping method to add to the cart
   * @return {Promise} the result of the update operation
   */
  async addShippingMethod(cartId, method) {
    const cart = await this.retrieve(cartId)
    const { shipping_methods } = cart

    const isValid = await this.shippingOptionService_.validateCartOption(
      method,
      cart
    )

    if (!isValid) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "The selected shipping method cannot be applied to the cart"
      )
    }

    // Go through all existing selected shipping methods and update the one
    // that has the same profile as the selected shipping method.
    let exists = false
    const newMethods = shipping_methods.map(sm => {
      if (sm.profile_id === method.profile_id) {
        exists = true
        return method
      }

      return sm
    })

    // If none of the selected methods are for the same profile as the new
    // shipping method the exists flag will be false. Therefore we push the new
    // method.
    if (!exists) {
      newMethods.push(method)
    }

    return this.cartModel_.updateOne(
      {
        _id: cart._id,
      },
      {
        $set: { shipping_methods: newMethods },
      }
    )
  }

  /**
   * Finds all shipping options that are available to the cart and stores them
   * in shipping_options. The shipping options are retrieved from the shipping
   * option service.
   * @param {string} cartId - the id of the cart
   * @return {Promse} the result of the update operation
   */
  async setShippingOptions(cartId) {
    const cart = await this.retrieve(cartId)

    // Get the shipping options available in the region
    const cartOptions = await this.shippingOptionService_.fetchCartOptions(cart)

    return this.cartModel_.updateOne(
      {
        _id: cart._id,
      },
      {
        $set: { shipping_options: cartOptions },
      }
    )
  }

  /**
   * Set's the region of a cart.
   * @param {string} cartId - the id of the cart to set region on
   * @param {string} regionId - the id of the region to set the cart to
   * @return {Promise} the result of the update operation
   */
  async setRegion(cartId, regionId) {
    const cart = await this.retrieve(cartId)
    const region = await this.regionService_.retrieve(regionId)

    let update = {
      region_id: region._id,
    }

    // If the cart contains items we want to change the unit_price field of each
    // item to correspond to the price given in the region
    if (cart.items.length) {
      const newItems = await Promise.all(
        cart.items.map(async lineItem => {
          try {
            lineItem.content = await this.updateContentPrice_(
              lineItem.content,
              region._id
            )
          } catch (err) {
            return null
          }
          return lineItem
        })
      )

      update.items = newItems.filter(i => !!i)
    }

    // If the country code of a shipping address is set we need to clear it
    let shippingAddress = cart.shipping_address
    if (!_.isEmpty(shippingAddress) && shippingAddress.country_code) {
      shippingAddress.country_code = ""
      update.shipping_address = shippingAddress
    }

    // If the country code of a billing address is set we need to clear it
    let billingAddress = cart.billing_address
    if (!_.isEmpty(billingAddress) && billingAddress.country_code) {
      billingAddress.country_code = ""
      update.billing_address = billingAddress
    }

    // Shipping methods are determined by region so the user needs to find a
    // new shipping method
    if (cart.shipping_methods && cart.shipping_methods.length) {
      update.shipping_methods = []
    }

    // Payment methods are region specific so the user needs to find a
    // new payment method
    if (!_.isEmpty(cart.payment_method)) {
      update.payment_method = undefined
    }

    return this.cartModel_.updateOne({ _id: cart._id }, { $set: update })
  }

  /**
   * Dedicated method to set metadata for a cart.
   * To ensure that plugins does not overwrite each
   * others metadata fields, setMetadata is provided.
   * @param {string} cartId - the cart to apply metadata to.
   * @param {string} key - key for metadata field
   * @param {string} value - value for metadata field.
   * @return {Promise} resolves to the updated result.
   */
  setMetadata(cartId, key, value) {
    const validatedId = this.validateId_(cartId)

    if (typeof key !== "string") {
      throw new MedusaError(
        MedusaError.Types.INVALID_ARGUMENT,
        "Key type is invalid. Metadata keys must be strings"
      )
    }

    const keyPath = `metadata.${key}`
    return this.cartModel_
      .updateOne({ _id: validatedId }, { $set: { [keyPath]: value } })
      .catch(err => {
        throw new MedusaError(MedusaError.Types.DB_ERROR, err.message)
      })
  }
}

export default CartService

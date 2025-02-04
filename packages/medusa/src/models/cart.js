/*******************************************************************************
 *
 ******************************************************************************/
import mongoose from "mongoose"
import { BaseModel } from "medusa-interfaces"

import LineItemSchema from "./schemas/line-item"
import PaymentMethodSchema from "./schemas/payment-method"
import ShippingMethodSchema from "./schemas/shipping-method"
import AddressSchema from "./schemas/address"

class CartModel extends BaseModel {
  static modelName = "Cart"

  static schema = {
    email: { type: String },
    billing_address: { type: AddressSchema, default: {} },
    shipping_address: { type: AddressSchema, default: {} },
    items: { type: [LineItemSchema], default: [] },
    region_id: { type: String, required: true },
    discounts: { type: [String], default: [] },
    customer_id: { type: String, default: "" },
    payment_sessions: { type: [PaymentMethodSchema], default: [] },
    shipping_options: { type: [ShippingMethodSchema], default: [] },
    payment_method: { type: PaymentMethodSchema, default: {} },
    shipping_methods: { type: [ShippingMethodSchema], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  }
}

export default CartModel

import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  price: number;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Customer not found');
    }

    const existentProducts = await this.productsRepository.findAllById(
      products,
    );

    if (!existentProducts.length) {
      throw new AppError('Could not find products');
    }

    const existentProdIds = existentProducts.map(product => product.id);

    const checkInexistent = products.filter(
      product => !existentProdIds.includes(product.id),
    );

    if (checkInexistent.length) {
      throw new AppError(
        `Could not find one or more products ${checkInexistent.join(', ')}`,
      );
    }

    const checkAvailability = products.filter(product => {
      return (
        existentProducts.filter(p => p.id === product.id)[0].quantity <
        product.quantity
      );
    });

    if (checkAvailability.length) {
      throw new AppError(
        `Quantity ${checkAvailability[0].quantity} not available for product ${checkAvailability[0].id}`,
      );
    }

    const purchaseProducts = products.map(product => ({
      product_id: product.id,
      price: existentProducts.filter(p => p.id === product.id)[0].price,
      quantity: product.quantity,
    }));

    const order = await this.ordersRepository.create({
      customer,
      products: purchaseProducts,
    });

    const updateProductQuantities = order.order_products.map(op => ({
      id: op.product_id,
      quantity:
        (existentProducts.find(p => p.id === op.product_id)?.quantity || 0) -
        op.quantity,
    }));

    await this.productsRepository.updateQuantity(updateProductQuantities);

    return order;
  }
}

export default CreateOrderService;

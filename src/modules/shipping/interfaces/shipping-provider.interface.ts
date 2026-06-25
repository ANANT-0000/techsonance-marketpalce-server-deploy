export interface IShippingProvider {
  getServiceability(
    data: {
      pickup_pincode: string;
      delivery_pincode: string;
      breadth: number;
      height: number;
      weight: number;
      qc_check: 0 | 1;
      is_return: 0 | 1;
      mode: string;
      cod: 0 | 1;
    },
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): Promise<any>;

  createDraftOrder(
    payload: any,
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): Promise<any>;

  generateAWB(
    shipmentId: number,
    courierId?: number,
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): Promise<any>;
}

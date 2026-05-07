import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

@Injectable()
export class PdfService {
  constructor() {}
  async generateWarehouseInvoice(
    invoiceNumber: string,
    orderInfo: any,
    vendorInfo: any,
    warehouseInfo: any,
    items: any[],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      this.generateHeader(doc, invoiceNumber, orderInfo);
      this.generateCustomerAndVendorInformation(
        doc,
        orderInfo,
        vendorInfo,
        warehouseInfo,
      );
      this.generateInvoiceTable(doc, items);
      this.generateFooter(doc);

      doc.end();
    });
  }

  private generateHeader(
    doc: typeof PDFDocument,
    invoiceNumber: string,
    orderInfo: any,
  ) {
    doc
      .fillColor('#444444')
      .fontSize(20)
      .text('TAX INVOICE', 50, 45, { align: 'right' })
      .fontSize(10)
      .text(`Invoice Number: ${invoiceNumber}`, { align: 'right' })
      .text(`Order ID: ${orderInfo.id}`, { align: 'right' })
      .text(`Invoice Date: ${new Date().toLocaleDateString()}`, {
        align: 'right',
      })
      .moveDown();
  }

  private generateCustomerAndVendorInformation(
    doc: typeof PDFDocument,
    orderInfo: any,
    vendorInfo: any,
    warehouseInfo: any,
  ) {
    doc.fillColor('#444444').fontSize(12).font('Helvetica-Bold');

    // Vendor Info (Left Side)
    doc.text('Sold By:', 50, 110);
    doc.font('Helvetica').fontSize(10);
    doc.text(vendorInfo.companyName, 50, 125);
    doc.text(
      `Warehouse: ${warehouseInfo.addressLine1}, ${warehouseInfo.city}`,
      50,
      140,
    );
    doc.text(`${warehouseInfo.state} - ${warehouseInfo.pincode}`, 50, 155);
    doc.text(`GSTIN: ${vendorInfo.gstNumber}`, 50, 170);
    doc.text(`Phone: ${vendorInfo.mobileNumber}`, 50, 185);
    doc.text(`Email: ${vendorInfo.email}`, 50, 200);

    // Customer Info (Right Side)
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('Billing / Shipping To:', 300, 110);
    doc.font('Helvetica').fontSize(10);
    doc.text(orderInfo.customerName, 300, 125);
    doc.text(`${orderInfo.shippingAddress.addressLine1}`, 300, 140);
    doc.text(
      `${orderInfo.shippingAddress.city}, ${orderInfo.shippingAddress.state}`,
      300,
      155,
    );
    doc.text(`Pincode: ${orderInfo.shippingAddress.pincode}`, 300, 170);
    doc.text(`Phone: ${orderInfo.customerPhone}`, 300, 185);

    doc.moveDown();
  }

  private generateInvoiceTable(doc: typeof PDFDocument, items: any[]) {
    let i;
    const invoiceTableTop = 250;

    doc.font('Helvetica-Bold');
    this.generateTableRow(
      doc,
      invoiceTableTop,
      'Item Description',
      'Qty',
      'Unit Price',
      'Tax Amount',
      'Total Amount',
    );
    this.generateHr(doc, invoiceTableTop + 20);
    doc.font('Helvetica');

    let position = 0;
    let grandTotal = 0;

    for (i = 0; i < items.length; i++) {
      const item = items[i];
      position = invoiceTableTop + (i + 1) * 30;

      // Limit product name characters to avoid layout breaks
      const truncatedName =
        item.productName.length > 40
          ? item.productName.substring(0, 37) + '...'
          : item.productName;

      // Calculate totals
      const itemValue = item.price * item.quantity;
      const taxAmount = item.taxAmount || 0; // Assuming tax is passed in item
      const totalAmount = itemValue + taxAmount;
      grandTotal += totalAmount;

      this.generateTableRow(
        doc,
        position,
        truncatedName,
        item.quantity.toString(),
        `$${item.price.toFixed(2)}`,
        `$${taxAmount.toFixed(2)}`,
        `$${totalAmount.toFixed(2)}`,
      );

      this.generateHr(doc, position + 20);
    }

    // Grand Total Row
    const totalPosition = position + 40;
    doc.font('Helvetica-Bold');
    this.generateTableRow(
      doc,
      totalPosition,
      '',
      '',
      '',
      'Grand Total:',
      `$${grandTotal.toFixed(2)}`,
    );
    doc.font('Helvetica');
  }

  private generateFooter(doc: typeof PDFDocument) {
    doc
      .fontSize(10)
      .text(
        'This is a computer generated invoice and does not require a signature.',
        50,
        700,
        { align: 'center', width: 500 },
      );
  }

  private generateTableRow(
    doc: typeof PDFDocument,
    y: number,
    description: string,
    qty: string,
    unitPrice: string,
    tax: string,
    total: string,
  ) {
    doc
      .fontSize(10)
      .text(description, 50, y, { width: 200 })
      .text(qty, 280, y, { width: 50, align: 'center' })
      .text(unitPrice, 330, y, { width: 70, align: 'right' })
      .text(tax, 400, y, { width: 70, align: 'right' })
      .text(total, 470, y, { width: 70, align: 'right' });
  }

  private generateHr(doc: typeof PDFDocument, y: number) {
    doc
      .strokeColor('#aaaaaa')
      .lineWidth(1)
      .moveTo(50, y)
      .lineTo(550, y)
      .stroke();
  }
}

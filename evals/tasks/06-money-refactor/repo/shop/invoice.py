from shop.discounts import coupon_discount, deal_discount
from shop.tax import tax_for


def build_invoice(cart, coupon_percent=0, deal_skus=()):
    lines = []
    for product, qty in cart.lines():
        gross = product.price * qty
        deal = deal_discount(product, qty, deal_skus)
        coupon = coupon_discount(gross - deal, coupon_percent)
        net = gross - deal - coupon
        lines.append({
            "sku": product.sku,
            "name": product.name,
            "qty": qty,
            "unit": product.price,
            "gross": gross,
            "discount": deal + coupon,
            "net": net,
            "tax": tax_for(net, product.category),
        })
    subtotal = sum(line["gross"] for line in lines)
    discount = sum(line["discount"] for line in lines)
    tax = sum(line["tax"] for line in lines)
    return {
        "lines": lines,
        "subtotal": subtotal,
        "discount": discount,
        "tax": tax,
        "total": subtotal - discount + tax,
    }


def render_invoice(invoice):
    out = []
    for line in invoice["lines"]:
        out.append(
            f"{line['sku']:<6} {line['name']:<18} {line['qty']:>3} x {line['unit']:>9.2f} {line['gross']:>11.2f}"
        )
    out.append("-" * 52)
    for label, key in (("Subtotal", "subtotal"), ("Discount", "discount"), ("Tax", "tax"), ("Total", "total")):
        amount = -invoice[key] if key == "discount" else invoice[key]
        out.append(f"{label:<40} {amount:>11.2f}")
    return "\n".join(out)

def deal_discount(product, qty, deal_skus):
    """3-for-2: every third unit of a deal SKU is free."""
    if product.sku not in deal_skus:
        return 0.0
    return (qty // 3) * product.price


def coupon_discount(amount, percent):
    return amount * percent / 100

RATES = {"standard": 19, "reduced": 7, "exempt": 0}


def tax_for(amount, category):
    return amount * RATES[category] / 100

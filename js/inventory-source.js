/*
  Shared inventory source for order-facing pickers.
  Keep category/product/variant/finished-good normalization here so Create Order
  and Order Detail do not drift into different dropdown lists.
*/

const INVENTORY_SOURCE = (() => {
  function normName(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  }

  function categoryName(variant) {
    return variant?.category?.name || variant?.inv_products?.inv_categories?.name || ''
  }

  function categorySubGroup(variant) {
    return variant?.category?.sub_group || variant?.inv_products?.inv_categories?.sub_group || ''
  }

  function isFinishedGoodVariant(variant) {
    const catName = String(categoryName(variant)).toLowerCase()
    const subGroup = String(categorySubGroup(variant)).toLowerCase()
    return subGroup === 'fg'
      || subGroup === 'finished goods'
      || catName.includes(' finished goods')
      || catName.endsWith(' fg')
  }

  function availableQty(variant) {
    return (variant?.rolls || variant?.inv_rolls || [])
      .filter(r => r.status === 'in_stock')
      .reduce((sum, roll) => sum + Number(roll.remaining_length || 0), 0)
  }

  function normalizeVariant(raw, productMap = new Map(), categoryMap = new Map()) {
    const product = raw.product || raw.inv_products || productMap.get(raw.product_id) || null
    const category = raw.category || product?.inv_categories || categoryMap.get(product?.category_id) || null
    const normalizedProduct = product
      ? { ...product, inv_categories: product.inv_categories || category }
      : null
    return {
      ...raw,
      rolls: raw.rolls || raw.inv_rolls || [],
      product: normalizedProduct,
      category,
      inv_products: raw.inv_products || normalizedProduct,
    }
  }

  function normalizeFinishedGood(item) {
    return {
      ...item,
      key: `fg:${item.id}`,
      source: 'fg_stock',
      fgStockId: item.id,
      variantId: null,
      code: item.code || '',
      name: item.name || 'Finished Good',
      description: item.description || '',
      purchase_cost: item.purchase_cost,
      quantity: Number(item.quantity || 0),
      unit: item.unit || 'pcs',
      categoryLabel: 'Finished Goods',
    }
  }

  function normalizeFinishedGoodVariant(variant) {
    return {
      key: `var:${variant.id}`,
      source: 'variant',
      fgStockId: null,
      variantId: variant.id,
      code: variant.product?.name || variant.inv_products?.name || variant.category?.name || '',
      name: variant.name || 'Finished Good',
      description: [variant.product?.name || variant.inv_products?.name, variant.category?.name].filter(Boolean).join(' - '),
      purchase_cost: variant.purchase_rate,
      quantity: availableQty(variant),
      unit: variant.unit || 'pcs',
      categoryLabel: variant.category?.name || 'Finished Goods',
      variant,
    }
  }

  function buildDirectOrderItems({
    fgStock = [],
    variants = [],
    includeVariant = () => true,
    includeAdditionalVariant = () => false,
  } = {}) {
    const fgStockItems = (fgStock || []).map(normalizeFinishedGood)
    const variantItems = (variants || [])
      .filter(v => (isFinishedGoodVariant(v) || includeAdditionalVariant(v)) && includeVariant(v))
      .map(normalizeFinishedGoodVariant)
    return [...fgStockItems, ...variantItems]
      .sort((a, b) => `${a.categoryLabel} ${a.name}`.localeCompare(`${b.categoryLabel} ${b.name}`))
  }

  async function loadCatalog({ includeCosts = true } = {}) {
    const variantSelect = includeCosts
      ? 'id, name, product_id, width_m, base_rate_sqm, unit, purchase_rate, inv_rolls(id, variant_id, batch_code, remaining_length, original_length, purchase_rate, status)'
      : 'id, name, product_id, width_m, base_rate_sqm, unit, inv_rolls(id, variant_id, batch_code, remaining_length, original_length, status)'
    const fgSelect = includeCosts
      ? 'id, code, name, description, purchase_cost, quantity, unit'
      : 'id, code, name, description, quantity, unit'

    const [catRes, prodRes, varRes, fgRes] = await Promise.all([
      db.from('inv_categories').select('id, name, sub_group').order('name'),
      db.from('inv_products').select('id, name, category_id').order('name'),
      db.from('inv_variants').select(variantSelect).order('name'),
      db.from('fg_stock').select(fgSelect).order('name'),
    ])

    const categories = catRes.data || []
    const products = prodRes.data || []
    const productMap = new Map(products.map(p => [p.id, p]))
    const categoryMap = new Map(categories.map(c => [c.id, c]))
    const variants = (varRes.data || []).map(v => normalizeVariant(v, productMap, categoryMap))

    return {
      categories,
      products,
      variants,
      fgStock: fgRes.data || [],
      errors: {
        categories: catRes.error,
        products: prodRes.error,
        variants: varRes.error,
        fgStock: fgRes.error,
      },
    }
  }

  return {
    normName,
    isFinishedGoodVariant,
    availableQty,
    normalizeVariant,
    buildDirectOrderItems,
    loadCatalog,
  }
})()

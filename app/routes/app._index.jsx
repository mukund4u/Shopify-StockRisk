import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  Collapsible,
  Box
} from "@shopify/polaris";

import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { sendEmailAlert } from "../utils/email.server";
import { useState } from "react";

// ================= PROCESS DATA FOR NEW DASHBOARD =================

function processDashboardData(products, salesMap) {
  const leadTime = 7;        // TODO: From settings
  const safetyStock = 0.2;   // TODO: From settings
  const daysAnalyzed = 30;    // Number of days for velocity calculation

  const processed = [];
  let totalRevenueRisk = 0;

  console.log("========== PROCESSING INVENTORY ==========");

  products.forEach(product => {
    product.node.variants.edges.forEach(variant => {
      const stock = variant.node.inventoryQuantity;
      const price = parseFloat(variant.node.price);
      const variantId = variant.node.id;
      const unitsSold = salesMap[variantId] || 0;
      const velocity = unitsSold / daysAnalyzed;

      // Create UNIQUE product name with price
      const uniqueName = `${product.node.title} ($${price})`;

      const item = {
        name: uniqueName,
        variantId: variantId,
        sku: variant.node.sku || "-",
        price,
        stock,
        unitsSold,
        velocity,
        daysLeft: 0,
        reorderQty: 0,
        status: "healthy",
        action: "",
        problem: "",
        impact: 0,
        productType: product.node.isGiftCard ? "giftcard" : "normal",
        baseName: product.node.title // For grouping
      };

      // ========== CASE 1: OVERSOLD (Negative Stock) ==========
      if (stock < 0) {
        const lostRevenue = Math.abs(stock) * price;

        item.daysLeft = 0;
        item.status = "critical";
        item.action = "REFUND/ADJUST";
        item.problem = `Oversold by ${Math.abs(stock)} units - $${lostRevenue} lost`;
        item.impact = lostRevenue;
        totalRevenueRisk += lostRevenue;
      }

      // ========== CASE 2: OUT OF STOCK ==========
      else if (stock === 0) {
        item.daysLeft = 0;
        item.status = "critical";
        item.action = "RESTOCK NOW";

        if (velocity > 0) {
          const lossDuringLeadTime = Math.round(velocity * leadTime * price);
          item.problem = `Out of stock - Losing ~$${lossDuringLeadTime} this week`;
          item.impact = lossDuringLeadTime;
        } else {
          item.problem = `No sales yet — we'll start tracking demand soon`;
          item.impact = price * 0.5;
        }

        totalRevenueRisk += item.impact;
      }

      // ========== CASE 3: IN STOCK BUT NO SALES DATA ==========
      else if (velocity === 0) {
        item.daysLeft = null;
        item.status = "info";
        item.action = "COLLECTING DATA";
        item.problem = "New product - no sales yet";
        item.impact = 0;
      }

      // ========== CASE 4: NORMAL (In stock with sales) ==========
      else {
        const daysLeft = stock / velocity;
        const daysLeftRounded = Math.floor(daysLeft);
        item.daysLeft = daysLeftRounded;

        if (daysLeft < leadTime) {
          const unitsNeededDuringLead = Math.ceil(velocity * leadTime);
          const reorderQty = Math.ceil((unitsNeededDuringLead * (1 + safetyStock)) - stock);
          const finalReorderQty = Math.max(0, reorderQty);
          const atRiskRevenue = Math.round(unitsNeededDuringLead * price);

          item.reorderQty = finalReorderQty;
          item.status = "critical";
          item.action = `ORDER ${finalReorderQty} UNITS NOW`;
          item.problem = `⚠️ CRITICAL: ${daysLeftRounded} days left`;
          item.impact = atRiskRevenue;
          totalRevenueRisk += atRiskRevenue;
        }
        else if (daysLeft < leadTime * 1.5) {
          item.status = "warning";
          item.action = "PLAN ORDER";
          item.problem = `⚠️ Plan: ${daysLeftRounded} days left`;
          item.impact = 0;
        }
        else {
          item.status = "success";
          item.action = "ON TRACK";
          item.problem = `✅ Healthy: ${daysLeftRounded} days left`;
          item.impact = 0;
        }
      }

      processed.push(item);
    });
  });

  // Group and sort critical items
  const critical = processed.filter(p => p.status === "critical");
  const warning = processed.filter(p => p.status === "warning");
  const healthy = processed.filter(p => p.status === "success");
  const info = processed.filter(p => p.status === "info");

  // ===== SMART GROUPING FOR DISPLAY =====
  const groupedCritical = groupSimilarItems(critical);

  // Sort by impact (highest first)
  groupedCritical.sort((a, b) => b.totalImpact - a.totalImpact);

  console.log("========== FINAL SUMMARY ==========");
  console.log(`Critical: ${critical.length} items (${groupedCritical.length} groups)`);
  console.log(`Warning: ${warning.length} | Healthy: ${healthy.length} | New: ${info.length}`);
  console.log(`💰 TOTAL REVENUE AT RISK: $${Math.round(totalRevenueRisk)}`);

  return {
    critical: groupedCritical, // Grouped for display
    allCritical: critical,     // All items for calculations
    warning,
    healthy,
    info,
    totalRevenueRisk: Math.round(totalRevenueRisk),
    summary: {
      critical: critical.length,
      warning: warning.length,
      healthy: healthy.length,
      info: info.length
    }
  };
}

// ===== SMART GROUPING FUNCTION =====
function groupSimilarItems(criticalItems) {
  const groups = [];
  const giftCards = [];
  const regularItems = [];

  // Separate gift cards from regular items
  criticalItems.forEach(item => {
    if (item.name.includes("Gift Card")) {
      giftCards.push(item);
    } else {
      regularItems.push(item);
    }
  });

  // Group gift cards
  if (giftCards.length > 0) {
    const totalGiftCardImpact = giftCards.reduce((sum, g) => sum + g.impact, 0);
    const totalGiftCardStock = giftCards.reduce((sum, g) => sum + g.stock, 0);
    const outOfStockCount = giftCards.filter(g => g.stock === 0).length;
    const oversoldCount = giftCards.filter(g => g.stock < 0).length;

    // Create ONE grouped gift card item
    groups.push({
      name: `Gift Cards (${giftCards.length} variants)`,
      displayName: "Gift Cards",
      count: giftCards.length,
      stock: totalGiftCardStock,
      impact: totalGiftCardImpact,
      totalImpact: totalGiftCardImpact,
      problem: `${oversoldCount} oversold · ${outOfStockCount} out of stock`,
      action: "REVIEW ALL",
      status: "critical",
      items: giftCards, // Keep original items for reference
      isGroup: true
    });
  }

  // Add regular items (sorted by impact)
  regularItems.sort((a, b) => b.impact - a.impact);

  // Take top 5 regular items to show
  const topRegularItems = regularItems.slice(0, 5);

  // Add remaining count if needed
  if (regularItems.length > 5) {
    const remainingCount = regularItems.length - 5;
    const remainingImpact = regularItems.slice(5).reduce((sum, r) => sum + r.impact, 0);

    topRegularItems.push({
      name: `...and ${remainingCount} more items`,
      displayName: `+${remainingCount} more`,
      impact: remainingImpact,
      totalImpact: remainingImpact,
      problem: `${remainingCount} additional items need attention`,
      action: "VIEW ALL",
      status: "critical",
      isMoreItem: true
    });
  }

  return [...groups, ...topRegularItems];
}

// Helper function for order dates
function getOrderByDate(daysFromNow) {
  if (daysFromNow <= 0) return "TODAY";
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

// ================= LOADER =================

export const loader = async ({ request }) => {

  const { admin } = await authenticate.admin(request);

  // -------- Fetch Products --------
  const productResponse = await admin.graphql(`
  {
    products(first:50){
      edges{
        node{
          id
          title
          isGiftCard
          variants(first:25){
            edges{
              node{
                id
                sku
                price
                inventoryQuantity  
              }
            }
          }
        }
      }
    }
  }
  `);

  const productData = await productResponse.json();
  const products = productData?.data?.products?.edges || [];

  // -------- Fetch Orders (increased for better accuracy) --------
  const ordersResponse = await admin.graphql(`
  {
    orders(first:250){
      edges{
        node{
          lineItems(first:50){
            edges{
              node{
                quantity
                variant{
                  id
                }
              }
            }
          }
        }
      }
    }
  }
  `);

  const ordersData = await ordersResponse.json();


  // -------- Build Sales Map --------
  const salesMap = {};

  ordersData?.data?.orders?.edges?.forEach(order => {

    order.node.lineItems.edges.forEach(item => {

      const variantId = item.node.variant?.id;
      const qty = item.node.quantity;

      if (!variantId) return;

      salesMap[variantId] = (salesMap[variantId] || 0) + qty;

    });

  });

  // -------- BUILD EMAIL DATA (SERVER SIDE) --------
  const criticalEmailData = [];
  // // ===== PROCESS DASHBOARD DATA ONCE =====
  //   const dashboardData = processDashboardData(products, salesMap);

  //   // Get the EXACT data that dashboard shows
  //   const criticalItems = dashboardData.allCritical || [];
  //   const totalRevenueRisk = dashboardData.totalRevenueRisk || 0;
  //   const summary = dashboardData.summary || { critical: 0, warning: 0, healthy: 0, info: 0 };

  //   products.forEach(product => {
  //     product.node.variants.edges.forEach(variant => {

  //       const stock = variant.node.inventoryQuantity;

  //       if (stock > 0) { // (stock > 0 && velocity > 0) {
  //         //const daysLeft = Math.floor(stock / velocity);

  //         if (true) {//daysLeft <= 7) {
  //           criticalEmailData.push({
  //             title: product.node.title,
  //             criticalItems,
  //             totalRevenueRisk,
  //             summary
  //           });
  //         }
  //       }

  //     });
  //   });

  //   // -------- SEND EMAIL (SERVER ONLY) --------
  //   if (criticalEmailData.length > 0) {
  //     console.log("📧 Sending email alert...");
  //     await sendEmailAlert(criticalEmailData);
  //   }

  // ===== PROCESS DASHBOARD DATA ONCE =====
  const dashboardData = processDashboardData(products, salesMap);

  // Get the EXACT data that dashboard shows
  const criticalItems = dashboardData.allCritical || [];
  const totalRevenueRisk = dashboardData.totalRevenueRisk || 0;
  const summary = dashboardData.summary || { critical: 0, warning: 0, healthy: 0, info: 0 };

  // -------- SEND EMAIL (SERVER ONLY) --------
  if (criticalItems.length > 0) {
    console.log("📧 Sending email with critical items...");
    console.log(`Critical: ${criticalItems.length} items | Total at risk: $${totalRevenueRisk}`);

    // Send a clean object with all needed data
    await sendEmailAlert({
      items: criticalItems,           // The actual critical items array
      totalRisk: totalRevenueRisk,    // The total revenue at risk
      summary: summary                 // Summary counts
    });

  } else {
    console.log("✅ No critical items - no email sent");
  }

  return {
    products,
    salesMap
  };
};

// ================= DASHBOARD COMPONENT =================

export default function Dashboard() {
  const data = useLoaderData();
  const [openAll, setOpenAll] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    newProducts: false
  });

  // Process data
  const {
    critical,
    allCritical,
    warning,
    healthy,
    info,
    totalRevenueRisk,
    summary
  } = processDashboardData(data.products, data.salesMap);

  const handleCopyOrder = () => {
    // Use ALL critical items for calculations, but show grouped in UI
    const itemsToCopy = allCritical.map(item => {
      if (item.stock < 0) {
        return `🔴 ${item.name}: OVERSOLD - adjust inventory`;
      } else if (item.stock === 0) {
        return `🟠 ${item.name}: OUT OF STOCK - reorder now`;
      } else if (item.reorderQty > 0) {
        return `🔵 ${item.name} → ${item.reorderQty} units`;
      }
      return null;
    }).filter(Boolean);

    const text = `STOCKRISK ACTION ITEMS\n\nTotal at risk: $${totalRevenueRisk}\n\n${itemsToCopy.join('\n')}`;
    navigator.clipboard.writeText(text);
    alert("✅ Action items copied to clipboard!");
  };

  return (
    <Page title="StockRisk Dashboard">
      <Layout>

        {/* 🚨 ALERT BANNER */}
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" tone="critical">
                🚨 {summary.critical} PRODUCT{(summary.critical !== 1) ? 'S' : ''} NEED ATTENTION NOW
              </Text>
              <Text variant="headingXl" tone="critical">
                💸 ${totalRevenueRisk.toLocaleString()} at risk
              </Text>
              <Text variant="bodySm" tone="subdued">
                {summary.critical} critical · {summary.warning} warning · {summary.healthy} healthy · {summary.info} new
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* 🔥 CRITICAL ITEMS - Grouped and Sorted */}
        {critical.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">🔥 Take Action Now ({summary.critical} items)</Text>

                {critical.map((item, i) => (
                  <Box
                    key={i}
                    padding="400"
                    background="bg-surface-critical"
                    borderRadius="200"
                  >
                    <InlineStack align="space-between" gap="400">
                      <BlockStack gap="050">
                        <Text fontWeight="semibold">
                          {item.isGroup ? item.name : item.displayName || item.name}
                          {item.count && <Text variant="bodySm" tone="subdued"> ({item.count} variants)</Text>}
                        </Text>
                        <Text variant="bodySm" tone="subdued">
                          {item.problem}
                        </Text>
                      </BlockStack>
                      <InlineStack gap="200">
                        {item.impact > 0 && (
                          <Badge tone="critical">${Math.round(item.impact)}</Badge>
                        )}
                        <Badge tone="critical">{item.action}</Badge>
                      </InlineStack>
                    </InlineStack>

                    {/* Show first few gift card variants if grouped */}
                    {item.isGroup && item.items && (
                      <Box paddingBlockStart="200" paddingBlockEnd="100">
                        <details>
                          <summary style={{ cursor: 'pointer', fontSize: '13px', color: '#666' }}>
                            View {item.items.length} gift card variants
                          </summary>
                          <Box paddingBlockStart="200">
                            {item.items.slice(0, 3).map((giftCard, idx) => (
                              <InlineStack key={idx} align="space-between" gap="400">
                                <Text variant="bodySm">{giftCard.name}</Text>
                                <Badge tone="critical">${Math.round(giftCard.impact)}</Badge>
                              </InlineStack>
                            ))}
                            {item.items.length > 3 && (
                              <Text variant="bodySm" tone="subdued">+{item.items.length - 3} more...</Text>
                            )}
                          </Box>
                        </details>
                      </Box>
                    )}
                  </Box>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* 📋 ACTION BUTTONS */}
        <Layout.Section>
          <InlineStack gap="200">
            <Button
              variant="primary"
              onClick={handleCopyOrder}
              disabled={allCritical.length === 0}
            >
              📋 Copy {allCritical.length} Action Item{allCritical.length !== 1 ? 's' : ''}
            </Button>
            <Button onClick={() => setOpenAll(!openAll)}>
              {openAll ? 'Show Less' : `View All Products (${warning.length + healthy.length + info.length})`}
            </Button>
          </InlineStack>
        </Layout.Section>

        {/* VIEW ALL PRODUCTS SECTION */}
        <Layout.Section>
          <Collapsible open={openAll}>
            <Box paddingBlockStart="400">

              {(warning.length > 0 || healthy.length > 0 || info.length > 0) ? (
                <>
                  {/* Warning Products */}
                  {warning.length > 0 && (
                    <Box paddingBlockEnd="400">
                      <Card>
                        <BlockStack gap="300">
                          <Text variant="headingMd">🟠 Plan Next 2 Weeks ({warning.length})</Text>
                          {warning.slice(0, 5).map((item, i) => (
                            <InlineStack key={i} align="space-between">
                              <BlockStack gap="050">
                                <Text>{item.name}</Text>
                                <Text variant="bodySm" tone="subdued">
                                  Stock: {item.stock} | {item.problem}
                                </Text>
                              </BlockStack>
                              <Badge tone="warning">{item.action}</Badge>
                            </InlineStack>
                          ))}
                          {warning.length > 5 && (
                            <Text variant="bodySm" tone="subdued">+{warning.length - 5} more...</Text>
                          )}
                        </BlockStack>
                      </Card>
                    </Box>
                  )}

                  {/* Healthy Products */}
                  {healthy.length > 0 && (
                    <Box paddingBlockEnd="400">
                      <Card>
                        <BlockStack gap="300">
                          <Text variant="headingMd">✅ Healthy Products ({healthy.length})</Text>
                          {healthy.slice(0, 5).map((item, i) => (
                            <InlineStack key={i} align="space-between">
                              <Text>{item.name}</Text>
                              <Badge tone="success">{item.action}</Badge>
                            </InlineStack>
                          ))}
                          {healthy.length > 5 && (
                            <Text variant="bodySm" tone="subdued">+{healthy.length - 5} more...</Text>
                          )}
                        </BlockStack>
                      </Card>
                    </Box>
                  )}

                  {/* New Products - With Clickable +X more */}
                  {info.length > 0 && (
                    <Card>
                      <BlockStack gap="300">
                        <Box paddingBlockEnd="200">
                          <InlineStack align="space-between">
                            <BlockStack gap="050">
                              <Text variant="headingMd">🆕 New Products ({info.length})</Text>
                              <Text variant="bodySm" tone="subdued">
                                These products need 2-4 weeks of sales data for accurate forecasting
                              </Text>
                            </BlockStack>
                            {info.length > 5 && (
                              <Button
                                size="slim"
                                onClick={() => setExpandedSections(prev => ({
                                  ...prev,
                                  newProducts: !prev.newProducts
                                }))}
                                monochrome
                              >
                                {expandedSections.newProducts ? 'Show Less' : `View All (${info.length})`}
                              </Button>
                            )}
                          </InlineStack>
                        </Box>

                        {/* Show first 5 products when collapsed */}
                        {!expandedSections.newProducts && (
                          <>
                            <BlockStack gap="200">
                              {info.slice(0, 5).map((item, i) => (
                                <InlineStack key={i} align="space-between">
                                  <Text>{item.name}</Text>
                                  <Badge tone="info">COLLECTING DATA</Badge>
                                </InlineStack>
                              ))}
                            </BlockStack>

                            {/* Clickable "+X more" text */}
                            {info.length > 5 && (
                              <Box
                                paddingBlockStart="200"
                                onClick={() => setExpandedSections(prev => ({
                                  ...prev,
                                  newProducts: true
                                }))}
                                style={{ cursor: 'pointer' }}
                              >
                                <InlineStack gap="100" align="center">
                                  <Text
                                    variant="bodyMd"
                                    fontWeight="bold"
                                    tone="subdued"
                                  >
                                    +{info.length - 5} more
                                  </Text>
                                  <Text variant="bodyMd" tone="subdued">
                                    ▼
                                  </Text>
                                </InlineStack>
                              </Box>
                            )}
                          </>
                        )}

                        {/* Expanded view - shows ALL products */}
                        {expandedSections.newProducts && (
                          <Box
                            paddingBlockStart="400"
                            borderBlockStartWidth="1"
                            borderColor="border"
                          >
                            <BlockStack gap="200">
                              {info.map((item, i) => (
                                <InlineStack key={i} align="space-between">
                                  <Text>{item.name}</Text>
                                  <Badge tone="info">COLLECTING DATA</Badge>
                                </InlineStack>
                              ))}
                            </BlockStack>

                            {/* Show Less button at bottom */}
                            <Box paddingBlockStart="400" paddingBlockEnd="200">
                              <Button
                                size="slim"
                                onClick={() => setExpandedSections(prev => ({
                                  ...prev,
                                  newProducts: false
                                }))}
                                monochrome
                              >
                                Show Less
                              </Button>
                            </Box>
                          </Box>
                        )}
                      </BlockStack>
                    </Card>
                  )}
                </>
              ) : (
                <Card>
                  <Text alignment="center" tone="subdued">No additional products to display</Text>
                </Card>
              )}

            </Box>
          </Collapsible>
        </Layout.Section>

        {/* Quick summary badges */}
        {!openAll && (warning.length > 0 || healthy.length > 0 || info.length > 0) && (
          <Layout.Section>
            <InlineStack gap="400">
              {warning.length > 0 && (
                <Badge tone="warning">{warning.length} need planning</Badge>
              )}
              {healthy.length > 0 && (
                <Badge tone="success">{healthy.length} healthy</Badge>
              )}
              {info.length > 0 && (
                <Badge tone="info">{info.length} new</Badge>
              )}
            </InlineStack>
          </Layout.Section>
        )}

      </Layout>
    </Page>
  );
}
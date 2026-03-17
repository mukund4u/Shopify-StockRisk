import {
  Page,
  Card,
  Text,
  DataTable,
  InlineGrid,
  Box,
  Badge
} from "@shopify/polaris";

import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { sendEmailAlert } from "../utils/email.server";


// ================= LOADER =================

export const loader = async ({ request }) => {

  const { admin } = await authenticate.admin(request);

  // -------- Fetch Products --------
  const productResponse = await admin.graphql(`
  {
    products(first:10){
      edges{
        node{
          id
          title
          variants(first:5){
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


  // -------- Fetch Orders --------
  const ordersResponse = await admin.graphql(`
  {
    orders(first:50){
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

  products.forEach(product => {
    product.node.variants.edges.forEach(variant => {

      const stock = variant.node.inventoryQuantity;
      const price = parseFloat(variant.node.price);

      const unitsSold = salesMap[variant.node.id] || 0;
      const velocity = unitsSold / 30;

      if (stock > 0) { // (stock > 0 && velocity > 0) {
        const daysLeft = Math.floor(stock / velocity);

        if ( true) {//daysLeft <= 7) {
          criticalEmailData.push({
            title: product.node.title,
            stock,
            daysLeft,
            price
          });
        }
      }

    });
  });


  // -------- SEND EMAIL (SERVER ONLY) --------
  if (criticalEmailData.length > 0) {
    console.log("📧 Sending email alert...");
    await sendEmailAlert(criticalEmailData);
  }

  return {
    products,
    salesMap
  };
};


// ================= DASHBOARD =================

export default function Dashboard() {

  const data = useLoaderData();

  const products = data?.products || [];
  const salesMap = data?.salesMap || {};

  const rows = [];
  const criticalItems = [];
  const criticalEmailData = [];

  let lowStock = 0;
  let totalProducts = 0;
  let revenueRisk = 0;

  let topProduct = null;
  let maxVelocity = 0;


  products.forEach(product => {

    product.node.variants.edges.forEach(variant => {

      totalProducts++;

      const stock = variant.node.inventoryQuantity;
      const price = parseFloat(variant.node.price);

      const unitsSold = salesMap[variant.node.id] || 0;
      const velocity = unitsSold / 30;

      let daysLeftDisplay = "—";
      let statusBadge;

      // ---------------------------
      // OVERSOLD (Negative Stock)
      // ---------------------------
      if (stock < 0) {

        daysLeftDisplay = "Oversold";

        statusBadge = (
          <Badge tone="critical">
            Oversold
          </Badge>
        );

        revenueRisk += Math.abs(stock) * price;

      }

      // ---------------------------
      // OUT OF STOCK
      // ---------------------------
      else if (stock === 0) {

        daysLeftDisplay = "0 days";

        statusBadge = (
          <Badge tone="warning">
            Out of Stock
          </Badge>
        );

        if (velocity > 0) {
          revenueRisk += velocity * 7 * price;
        }

      }

      // ---------------------------
      // NO SALES DATA
      // ---------------------------
      else if (velocity === 0) {

        daysLeftDisplay = "No sales data";

        statusBadge = (
          <Badge tone="info">
            New Product
          </Badge>
        );

      }

      // ---------------------------
      // NORMAL CALCULATION
      // ---------------------------
      else {

        const daysLeft = Math.floor(stock / velocity);
        daysLeftDisplay = `${daysLeft} days`;

        if (daysLeft <= 7) {

          statusBadge = (
            <Badge tone="critical">
              Critical
            </Badge>
          );

          criticalItems.push(product.node.title);

          criticalEmailData.push({
            title: product.node.title,
            sku: variant.node.sku || "-",
            stock,
            daysLeft,
            price
          });

          revenueRisk += price * velocity * 7;

        }
        else if (daysLeft <= 14) {

          statusBadge = (
            <Badge tone="warning">
              Warning
            </Badge>
          );

        }
        else {

          statusBadge = (
            <Badge tone="success">
              Healthy
            </Badge>
          );

        }

      }


      if (stock < 10) {
        lowStock++;
      }


      // -------- Top Selling Product --------
      if (velocity > maxVelocity) {
        maxVelocity = velocity;
        topProduct = product.node.title;
      }


      rows.push([
        product.node.title,
        variant.node.sku || "-",
        `$${price}`,
        stock,
        velocity.toFixed(2),
        daysLeftDisplay,
        statusBadge
      ]);

    });

  });

  return (
    <Page title="StockRisk Dashboard">

      {/* HERO METRICS */}
      <InlineGrid columns={3} gap="400">

        <Card>
          <Box padding="400">
            <Text variant="headingLg">{lowStock}</Text>
            <Text tone="subdued">
              Products Low Stock
            </Text>
          </Box>
        </Card>

        <Card>
          <Box padding="400">
            <Text variant="headingLg">{totalProducts}</Text>
            <Text tone="subdued">
              Variants Tracked
            </Text>
          </Box>
        </Card>

        <Card>
          <Box padding="400">
            <Text variant="headingLg">
              ${Math.round(revenueRisk)}
            </Text>
            <Text tone="subdued">
              Revenue At Risk
            </Text>
          </Box>
        </Card>

      </InlineGrid>

      <Box paddingBlockStart="500">

        {/* CRITICAL INVENTORY */}
        <Card>
          <Box padding="400">

            <Text variant="headingMd">
              🚨 Critical Inventory
            </Text>

            {criticalItems.length === 0 ? (
              <Text tone="success">
                No critical inventory
              </Text>
            ) : (
              criticalItems.slice(0, 3).map((item, i) => (
                <Text key={i} tone="critical">
                  {item} may run out soon
                </Text>
              ))
            )}

          </Box>
        </Card>

      </Box>

      <Box paddingBlockStart="500">

        {/* TOP SELLING PRODUCT */}
        <Card>
          <Box padding="400">

            <Text variant="headingMd">
              Top Selling Product
            </Text>

            <Text tone="subdued">
              {topProduct || "Learning from sales data"}
            </Text>

          </Box>
        </Card>

      </Box>



      <Box paddingBlockStart="500">

        {/* INVENTORY TABLE */}
        <Card>

          <Box padding="400">
            <Text variant="headingMd">
              Inventory Forecast
            </Text>
          </Box>

          <DataTable
            columnContentTypes={[
              "text",
              "text",
              "numeric",
              "numeric",
              "numeric",
              "text",
              "text"
            ]}
            headings={[
              "Product",
              "SKU",
              "Price",
              "Stock",
              "Velocity/day",
              "Days Left",
              "Status"
            ]}
            rows={rows}
          />

        </Card>

      </Box>

    </Page>
  );
}
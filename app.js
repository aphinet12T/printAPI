const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const cors = require('cors');
const fs = require('fs-extra');
const Receipt = require('./models/receipt.js')
const Return = require('./models/return.js')

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(cors());

mongoose.connect('mongodb://dev12t:12Trading%40!@192.168.44.64:27017/printreceipt')
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));

function getCurrentDate() {
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
}

async function fetchExistingCUORs(currentDate) {
    const receipts = await Receipt.find({ OAORDT: currentDate }).select('CUOR -_id');
    return receipts.map(receipt => receipt.CUOR);
}

async function fetchData() {
    const currentDate = getCurrentDate();
    const existingCUORs = await fetchExistingCUORs(currentDate);

    try {
        const response = await axios.get('https://www.fplusstore.com/BCWEB_SERVICES/JSON_VAN_sendOrder.aspx', {
            params: {
                // DATE_FROM: currentDate,
                // DATE_TO: currentDate
                DATE_FROM: '20241001',
                DATE_TO: '20241031'
            },
            timeout: 20000
        });

        const newData = response.data.filter(order => !existingCUORs.includes(order.CUOR));
        return newData;
    } catch (error) {
        console.error('Error fetching data from API:', error.message);
        return [];
    }
}

async function fetchItemNames(itemCodes) {
    const itemNames = {};
    await Promise.all(itemCodes.map(async (itemCode) => {
        try {
            const response = await axios.post('http://192.168.2.97:8383/M3API/ItemManage/Item/getItem', {
                itemcode: itemCode
            }, {
                timeout: 10000
            });
            const item = response.data[0];
            const itemDescription = item && item.itemdescripton ? item.itemdescripton : 'Unknown Item';
            itemNames[itemCode] = itemDescription;
        } catch (error) {
            console.error(`Error fetching item name for ${itemCode}:`, error.message);
            itemNames[itemCode] = 'Unknown Item';
        }
    }));
    return itemNames;
}

async function combineData() {
    const newData = await fetchData();
    const itemCodes = [...new Set(newData.map(order => order.OBITNO))];
    const itemNames = await fetchItemNames(itemCodes);

    const unitMap = {
        'BAG': 'ถุง',
        'BOT': 'ขวด',
        'CTN': 'หีบ',
        'PAC': 'แพ๊ค',
        'PCS': 'ซอง',
        'CRT': 'กล่อง'
    };

    for (const order of newData) {
        const existingOrder = await Receipt.findOne({ CUOR: order.CUOR });
        const itemamount = (parseFloat(order.OBSAPR) - parseFloat(order.OBDIA2)) * parseFloat(order.OBORQA);
        const disamount = parseFloat((parseFloat(order.OBDIA2) * parseFloat(order.OBORQA)).toFixed(2));

        let unit = unitMap[order.OBSPUN] || order.OBSPUN;
        if (order.OBITNO.startsWith('600') && order.OBSPUN === 'PCS') {
            unit = 'ชิ้น';
        }

        const qtytext = `${order.OBORQA} ${unit}`;
        const item = {
            OBALUN: order.OBALUN,
            OBDIA2: order.OBDIA2,
            OBITNO: order.OBITNO,
            OBORQA: order.OBORQA,
            OBPIDE: order.OBPIDE,
            OBPONR: order.OBPONR,
            OBSAPR: order.OBSAPR,
            OBSPUN: order.OBSPUN,
            itemamount: itemamount,
            disamount: disamount,
            itemname: itemNames[order.OBITNO],
            unit: unit,
            qtytext: qtytext
        };

        if (existingOrder) {
            const itemExists = existingOrder.items.find(existingItem =>
                existingItem.OBPONR === item.OBPONR && existingItem.OBITNO === item.OBITNO
            );

            if (!itemExists) {
                existingOrder.items.push(item);
            }
            existingOrder.total = parseFloat(existingOrder.items.reduce((sum, item) => sum + item.itemamount, 0).toFixed(2));
            existingOrder.totaldis = parseFloat(existingOrder.items.reduce((sum, item) => sum + item.disamount, 0).toFixed(2));
            existingOrder.ex_vat = Math.ceil((existingOrder.total / 1.07) * 100) / 100;
            existingOrder.vat = parseFloat((existingOrder.total - existingOrder.ex_vat).toFixed(2));
            await existingOrder.save();
        } else {
            const newReceipt = new Receipt({
                CUNO: order.CUNO,
                CUOR: order.CUOR,
                FACT: order.FACT,
                OAODAM: order.OAODAM,
                OAORDT: order.OAORDT,
                OAORTP: order.OAORTP,
                RLDT: order.RLDT,
                WHLO: order.WHLO,
                OBSMCD: order.OBSMCD,
                items: [item]
            });
            newReceipt.total = item.itemamount;
            newReceipt.totaldis = item.disamount;
            newReceipt.ex_vat = Math.ceil((newReceipt.total / 1.07) * 100) / 100;
            newReceipt.vat = parseFloat((newReceipt.total - newReceipt.ex_vat).toFixed(2));
            await newReceipt.save();
        }
    }
}

function trimCustomerData(customer) {
    if (!customer) return {};
    return {
        companycode: customer.companycode,
        status: customer.status ? customer.status.trim() : '',
        customertype: customer.customertype ? customer.customertype.trim() : '',
        customercode: customer.customercode ? customer.customercode.trim() : '',
        customername: customer.customername + customer.customername2 ? customer.customername.trim() + customer.customername2.trim() : '',
        addressid: customer.addressid ? customer.addressid.trim() : '',
        address1: customer.address1 ? customer.address1.trim() : '',
        address2: customer.address2 ? customer.address2.trim() : '',
        address3: customer.address3 ? customer.address3.trim() : '',
        postcode: customer.postcode ? customer.postcode.trim() : '',
        phone: customer.phone ? customer.phone.trim() : '',
        salecode: customer.salecode ? customer.salecode.trim() : '',
        ordertype: customer.ordertype ? customer.ordertype.trim() : '',
        warehouse: customer.warehouse ? customer.warehouse.trim() : '',
        zone: customer.zone ? customer.zone.trim() : '',
        area: customer.area ? customer.area.trim() : '',
        team: customer.team ? customer.team.trim() : '',
        duocode: customer.duocode ? customer.duocode.trim() : '',
        route: customer.route ? customer.route.trim() : '',
        payer: customer.payer ? customer.payer.trim() : '',
        taxno: customer.taxno ? customer.taxno.trim() : ''
    };
}

function formatDate(dateString) {
    if (!dateString) return '';
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    return `${day}/${month}/${year}`;
}

app.post('/receipt/orders', async (req, res) => {
    const { warehouse } = req.body;
    try {
        await combineData();
        const response = await Receipt.find({ WHLO: warehouse });

        const response2 = await axios.post('http://192.168.2.97:8383/M3API/OrderManage/order/getCustomer', {
            customertype: '103'
        }, {
            timeout: 10000
        });
        const customers = response2.data;

        const whloToAreaMap = {
            "211": "BE211",
            "212": "BE212",
            "213": "BE213",
            "214": "BE214"
        };

        let combinedResponse = response.map(order => {
            const customer = customers.find(cust => cust.customercode.trim() === order.CUNO.trim());
            const mappedArea = whloToAreaMap[order.WHLO.trim()] || '';

            console.log('Order WHLO:', order.WHLO.trim());
            console.log('Mapped Area:', mappedArea);
            console.log('Customer found:', customer);

            return {
                OAORDT: formatDate(order.OAORDT),
                CUNO: order.CUNO,
                customername: customer ? customer.customername : '',
                CUOR: order.CUOR,
                total: order.total,
                warehouse: order.WHLO,
                area: mappedArea
            };
        });

        console.log('Combined Response:', combinedResponse);

        const result = warehouse ? combinedResponse.filter(order => order.warehouse === warehouse.trim()) : combinedResponse;

        console.log('Filtered Result:', result);

        combinedResponse = result.sort((a, b) => {
            return b.CUOR.localeCompare(a.CUOR);
        });

        res.json(combinedResponse);
    } catch (error) {
        console.error('Error processing orders:', error.message);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

app.post('/receipt/orderDetail', async (req, res) => {
    let { order } = req.body;

    try {
        const combinedData = await Receipt.find({ CUOR: order }).lean();

        const validWHLO = ["211", "212", "213", "214"];
        const filteredOrders = combinedData.filter(order => validWHLO.includes(order.WHLO.trim()));

        const response2 = await axios.post('http://192.168.2.97:8383/M3API/OrderManage/order/getCustomer', {
            customertype: '103'
        }, {
            timeout: 10000
        });

        const customers = response2.data;

        let combinedResponse = filteredOrders.map(order => {
            const customer = customers.find(cust => cust.customercode.trim() === order.CUNO);

            const sortedItems = order.items.sort((a, b) => {
                if (!a.OBPIDE) return -1;
                if (!b.OBPIDE) return 1;
                return a.OBPIDE.localeCompare(b.OBPIDE);
            });

            return {
                CUNO: order.CUNO,
                CUOR: order.CUOR,
                FACT: order.FACT,
                OAODAM: order.OAODAM,
                OAORDT: formatDate(order.OAORDT),
                OAORTP: order.OAORTP,
                RLDT: order.RLDT,
                WHLO: order.WHLO,
                OBSMCD: order.OBSMCD,
                total: order.total.toFixed(2).toLocaleString(),
                totaltext: order.total,
                totaldis: order.totaldis.toFixed(2).toLocaleString(),
                ex_vat: order.ex_vat.toFixed(2).toLocaleString(),
                vat: order.vat.toFixed(2).toLocaleString(),
                customer: trimCustomerData(customer),
                items: sortedItems.map(item => ({
                    ...item,
                    OBSAPR: parseFloat(item.OBSAPR).toFixed(2).toLocaleString(),
                    disamount: item.disamount.toFixed(2).toLocaleString(),
                    itemamount: item.itemamount.toFixed(2).toLocaleString()
                })),
                area: customer ? customer.area.trim() : null
            };
        });

        const result = order ? combinedResponse.filter(item => item.CUOR === order) : combinedResponse;

        combinedResponse = result.sort((a, b) => {
            return b.CUOR.localeCompare(a.CUOR);
        });

        res.json(combinedResponse);
    } catch (error) {
        console.error('Error processing orders:', error.message);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

app.post('/return/upload', upload.single('file'), async (req, res) => {
    try {
        const filePath = path.join(__dirname, req.file.path);
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);

        const groupedData = {};

        data.forEach(row => {
            const key = `${row.CUNO}_${row.OAORDT}`;
            const item = {
                CUOR: row.CUOR,
                OBITNO: row.OBITNO,
                OBALUN: row.OBALUN,
                OBORQA: row.OBORQA,
                OBSAPR: row.OBSAPR,
                OBSPUN: row.OBSPUN,
                OBWHSL: row.OBWHSL,
                OBPONR: row.OBPONR,
                OBDIA2: row.OBDIA2,
                OBSMCD: row.OBSMCD,
                OAORTP: row.OAORTP
            };

            if (!groupedData[key]) {
                groupedData[key] = {
                    CUNO: row.CUNO,
                    FACI: row.FACI,
                    WHLO: row.WHLO,
                    RLDT: row.RLDT,
                    OAOREF: row.OAOREF,
                    saleItems: [],
                    returnItems: [],
                    OAORDT: row.OAORDT
                };
            }

            if (row.OBBANO === 'RETURN') {
                groupedData[key].returnItems.push(item);
            } else {
                groupedData[key].saleItems.push(item);
            }
        });

        const returnDocs = Object.values(groupedData);

        await Return.insertMany(returnDocs);
        await fs.remove(filePath);

        res.status(200).json({ message: 'File uploaded and data imported successfully.' });
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

app.post('/receipt/returns', async (req, res) => {
    const { warehouse } = req.body;
    try {
        const returns = await Return.find({ WHLO: warehouse });
        
        const response2 = await axios.post('http://192.168.2.97:8383/M3API/OrderManage/order/getCustomer', {
            customertype: '103'
        }, {
            timeout: 10000
        });

        const customers = response2.data;

        const whloToAreaMap = {
            "211": "BE211",
            "212": "BE212",
            "213": "BE213",
            "214": "BE214"
        };

        let combinedResponse = returns.map(order => {
            const customer = customers.find(cust => cust.customercode.trim() === order.CUNO);
            const mappedArea = whloToAreaMap[order.WHLO.trim()] || '';
            return {
                OAORDT: formatDate(order.OAORDT),
                CUNO: order.CUNO,
                customername: customer ? customer.customername : '',
                warehouse: order.WHLO,
                area: mappedArea,
                CUOR: order.saleItems.length > 0 ? order.saleItems[0].CUOR : ''
            };
        });

        res.json(combinedResponse);
    } catch (error) {
        console.error('Error processing orders:', error.message);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

app.post('/receipt/returnDetail', async (req, res) => {
    try {
        const { CUOR } = req.body;

        const order = await Return.findOne({ 'saleItems.CUOR': CUOR }).lean();

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const validWHLO = ["211", "212", "213", "214"];
        const filteredOrder = validWHLO.includes(order.WHLO.trim()) ? order : null;

        if (!filteredOrder) {
            return res.status(404).json({ message: 'Order not found in the specified warehouses' });
        }

        const response = await axios.post('http://192.168.2.97:8383/M3API/OrderManage/order/getCustomer', {
            customertype: '103'
        }, {
            timeout: 10000
        });

        const customers = response.data;
        const customer = customers.find(cust => cust.customercode.trim() === order.CUNO);

        const itemCodes = [...new Set([
            ...order.saleItems.map(item => item.OBITNO),
            ...order.returnItems.map(item => item.OBITNO)
        ])];
        const itemNames = await fetchItemNames(itemCodes);

        const unitMap = {
            'BAG': 'ถุง',
            'BOT': 'ขวด',
            'CTN': 'หีบ',
            'PAC': 'แพ๊ค',
            'PCS': 'ซอง',
            'CRT': 'กล่อง'
        };

        let saleTotalText = 0;
        let returnTotalText = 0;

        const combinedResponse = {
            CUNO: order.CUNO,
            CUOR: CUOR,
            FACT: order.FACI,
            OAODAM: order.OAOREF,
            OAORDT: formatDate(order.OAORDT),
            OAORTP: order.OAORTP,
            RLDT: order.RLDT,
            WHLO: order.WHLO,
            OBSMCD: order.OBSMCD,
            customer: trimCustomerData(customer),
            saleno: order.saleItems.length ? order.saleItems[0].CUOR : '',
            returnno: order.returnItems.length ? order.returnItems[0].CUOR : '',
            saleItems: order.saleItems.map(item => {
                const unit = unitMap[item.OBSPUN] || item.OBSPUN;
                const qtytext = `${Math.abs(item.OBORQA)} ${unit}`;
                const total = item.OBSAPR * item.OBORQA;
                const totaldis = item.OBDIA2 * item.OBORQA;
                const ex_vat = total / 1.07;
                const vat = total - ex_vat;

                saleTotalText += total;

                return {
                    ...item,
                    itemname: itemNames[item.OBITNO],
                    OBSAPR: item.OBSAPR.toFixed(2),
                    disamount: totaldis.toFixed(2),
                    itemamount: total.toFixed(2),
                    total: total.toFixed(2),
                    totaltext: parseFloat(total.toFixed(2)),
                    totaldis: totaldis.toFixed(2),
                    ex_vat: ex_vat.toFixed(2),
                    vat: vat.toFixed(2),
                    unit: unit,
                    qtytext: qtytext
                };
            }),
            returnItems: order.returnItems.map(item => {
                const unit = unitMap[item.OBSPUN] || item.OBSPUN;
                const qtytext = `${Math.abs(item.OBORQA)} ${unit}`;
                const total = Math.abs(item.OBSAPR * item.OBORQA);
                const totaldis = Math.abs(item.OBDIA2 * item.OBORQA);
                const ex_vat = Math.abs(total / 1.07);
                const vat = Math.abs(total - ex_vat);

                returnTotalText += total;

                return {
                    ...item,
                    itemname: itemNames[item.OBITNO],
                    OBSAPR: item.OBSAPR.toFixed(2),
                    disamount: totaldis.toFixed(2),
                    itemamount: total.toFixed(2),
                    total: total.toFixed(2),
                    totaltext: parseFloat(total.toFixed(2)),
                    totaldis: totaldis.toFixed(2),
                    ex_vat: ex_vat.toFixed(2),
                    vat: vat.toFixed(2),
                    unit: unit,
                    qtytext: qtytext
                };
            }),
            area: customer ? customer.area.trim() : null
        };

        combinedResponse.saletotal = saleTotalText.toFixed(2);
        combinedResponse.saletotaltext = parseFloat(saleTotalText.toFixed(2));
        combinedResponse.saletotaldis = "0.00";
        combinedResponse.saleex_vat = (saleTotalText / 1.07).toFixed(2);
        combinedResponse.salevat = (saleTotalText - (saleTotalText / 1.07)).toFixed(2);

        combinedResponse.returntotal = returnTotalText.toFixed(2);
        combinedResponse.returntotaltext = parseFloat(returnTotalText.toFixed(2));
        combinedResponse.returntotaldis = "0.00";
        combinedResponse.returnex_vat = (returnTotalText / 1.07).toFixed(2);
        combinedResponse.returnvat = (returnTotalText - (returnTotalText / 1.07)).toFixed(2);

        combinedResponse.change = (saleTotalText - returnTotalText).toFixed(2);
        combinedResponse.changeText = parseFloat((saleTotalText - returnTotalText).toFixed(2));

        res.json(combinedResponse);
    } catch (error) {
        console.error('Error processing order details:', error.message);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

module.exports = app;
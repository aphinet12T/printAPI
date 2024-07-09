const express = require('express')
const axios = require('axios')
const fs = require('fs-extra')
const path = require('path')
const cors = require('cors')

const app = express()
const dataFilePath = path.join(__dirname, 'orders.json')

app.use(express.json())
app.use(cors())

function getCurrentDate() {
    const date = new Date()
    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    return `${year}${month}${day}`
}

function slicePackSize(name) {
    return name.replace(/ x\d+x\d+| x\d+/g, '');
}

async function fetchData() {
    const currentDate = getCurrentDate()
    try {
        const response = await axios.get('https://www.fplusstore.com/BCWEB_SERVICES/JSON_VAN_sendOrder.aspx', {
            params: {
                DATE_FROM: currentDate,
                DATE_TO: currentDate
            },
            timeout: 10000
        })
        return response.data
    } catch (error) {
        console.error('Error fetching data from API:', error.message)
        return []
    }
}

async function fetchItemNames(itemCodes) {
    const itemNames = {};
    await Promise.all(itemCodes.map(async (itemCode) => {
      try {
        const response = await axios.post('http://192.168.2.97:8383/M3API/ItemManage/Item/getItem', {
          itemcode: itemCode
        },{
          timeout: 10000
        });
        const item = response.data[0]; 
        const itemDescription = item && item.itemdescripton ? item.itemdescripton.trim() : 'Unknown Item';
        itemNames[itemCode] = slicePackSize(itemDescription);
      } catch (error) {
        console.error(`Error fetching item name for ${itemCode}:`, error.message);
        itemNames[itemCode] = 'Unknown Item';
      }
    }));
    return itemNames;
  }

async function combineData(newData) {
    let existingData = []
    if (await fs.pathExists(dataFilePath)) {
        try {
            existingData = await fs.readJson(dataFilePath)
        } catch (error) {
            console.error('Error reading existing data:', error.message)
        }
    }

    const itemCodes = [...new Set(newData.map(order => order.OBITNO))]
    const itemNames = await fetchItemNames(itemCodes)

    newData.forEach(order => {
        const existingOrder = existingData.find(
            existingOrder => existingOrder.CUOR === order.CUOR
        )
        const itemamount = parseFloat(order.OBSAPR) * parseFloat(order.OBORQA)
        if (existingOrder) {
            if (!existingOrder.items) {
                existingOrder.items = []
            }

            const itemExists = existingOrder.items.find(item =>
                item.OBPONR === order.OBPONR && item.OBITNO === order.OBITNO
            )
            if (!itemExists) {
                existingOrder.items.push({
                    OBALUN: order.OBALUN,
                    OBDIA2: order.OBDIA2,
                    OBITNO: order.OBITNO,
                    OBORQA: order.OBORQA,
                    OBPIDE: order.OBPIDE,
                    OBPONR: order.OBPONR,
                    OBSAPR: order.OBSAPR,
                    OBSPUN: order.OBSPUN,
                    itemamount: itemamount,
                    itemname: itemNames[order.OBITNO]
                })
            }
        } else {
            existingData.push({
                CUNO: order.CUNO,
                CUOR: order.CUOR,
                FACT: order.FACT,
                OAODAM: order.OAODAM,
                OAORDT: order.OAORDT,
                OAORTP: order.OAORTP,
                RLDT: order.RLDT,
                WHLO: order.WHLO,
                OBSMCD: order.OBSMCD,
                items: [{
                    OBALUN: order.OBALUN,
                    OBDIA2: order.OBDIA2,
                    OBITNO: order.OBITNO,
                    OBORQA: order.OBORQA,
                    OBPIDE: order.OBPIDE,
                    OBPONR: order.OBPONR,
                    OBSAPR: order.OBSAPR,
                    OBSPUN: order.OBSPUN,
                    itemamount: itemamount,
                    itemname: itemNames[order.OBITNO]
                }]
            })
        }
    })

    existingData.forEach(order => {
        order.total = parseFloat(order.items.reduce((sum, item) => sum + item.itemamount, 0).toFixed(2))
        order.ex_vat = Math.ceil((order.total / 1.07) * 100) / 100
        order.vat = parseFloat((order.total - order.ex_vat).toFixed(2))

    })

    return existingData
}

async function saveDataToFile(data) {
    try {
        await fs.writeJson(dataFilePath, data, { spaces: 2 })
        console.log('Data saved to orders.json')
    } catch (error) {
        console.error('Error saving data to file:', error.message)
    }
}

function trimCustomerData(customer) {
    if (!customer) return {}
    return {
        companycode: customer.companycode,
        status: customer.status ? customer.status.trim() : '',
        customertype: customer.customertype ? customer.customertype.trim() : '',
        customercode: customer.customercode ? customer.customercode.trim() : '',
        customername: customer.customername ? customer.customername.trim() : '',
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
        taxno: customer.taxno ? customer.taxno.trim() : '',
    }
}

function formatDate(dateString) {
    if (!dateString) return ''
    const year = dateString.substring(0, 4)
    const month = dateString.substring(4, 6)
    const day = dateString.substring(6, 8)
    return `${day}/${month}/${year}`
}

app.get('/receipt/orderAll', async (req, res) => {
    try {

        const newData = await fetchData()
        const combinedData = await combineData(newData)

        await saveDataToFile(combinedData)

        const validWHLO = ["215", "216", "217", "218"]
        const filteredOrders = combinedData.filter(order => validWHLO.includes(order.WHLO.trim()))

        const response2 = await axios.post('http://192.168.2.97:8383/M3API/OrderManage/order/getCustomer', {
            customertype: '103'
        }, {
            timeout: 10000
        })

        const customers = response2.data

        const combinedResponse = filteredOrders.map(order => {
            const customer = customers.find(cust => cust.customercode === order.CUNO)
            return {
                CUNO: order.CUNO,
                CUOR: order.CUOR,
                FACT: order.FACT,
                OAODAM: order.OAODAM,
                OAORDT: order.OAORDT,
                OAORTP: order.OAORTP,
                RLDT: order.RLDT,
                WHLO: order.WHLO,
                OBSMCD: order.OBSMCD,
                total: order.total,
                vat: order.vat,
                ex_vat: order.ex_vat,
                customer: trimCustomerData(customer),
                items: order.items
            }
        })

        res.json(combinedResponse)
    } catch (error) {
        console.error('Error processing orders:', error.message)
        res.status(500).json({ message: 'Internal Server Error' })
    }
})

app.post('/receipt/orderArea', async (req, res) => {
    let { area } = req.body

    try {
        const newData = await fetchData()
        const combinedData = await combineData(newData)

        await saveDataToFile(combinedData)

        const validWHLO = ["215", "216", "217", "218"]
        const filteredOrders = combinedData.filter(order => validWHLO.includes(order.WHLO.trim()))

        const response2 = await axios.post('http://192.168.2.97:8383/M3API/OrderManage/order/getCustomer', {
            customertype: '103'
        }, {
            timeout: 10000
        })

        const customers = response2.data

        let combinedResponse = filteredOrders.map(order => {
            const customer = customers.find(cust => cust.customercode === order.CUNO)
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
                total: order.total,
                ex_vat: order.ex_vat,
                vat: order.vat,
                customer: trimCustomerData(customer),
                items: order.items,
                area: customer ? customer.area.trim() : null
            }
        })

        const result = area ? combinedResponse.filter(order => order.area === area) : combinedResponse

        combinedResponse = result.sort((a, b) => {
            return b.CUOR.localeCompare(a.CUOR)
        })

        res.json(combinedResponse)
    } catch (error) {
        console.error('Error processing orders:', error.message)
        res.status(500).json({ message: 'Internal Server Error' })
    }
})

app.post('/receipt/orders', async (req, res) => {
    const { area } = req.body

    try {
        const newData = await fetchData()
        const combinedData = await combineData(newData)

        await saveDataToFile(combinedData)

        const validWHLO = ["215", "216", "217", "218"]
        const filteredOrders = combinedData.filter(order => validWHLO.includes(order.WHLO.trim()))

        const response2 = await axios.post('http://192.168.2.97:8383/M3API/OrderManage/order/getCustomer', {
            customertype: '103'
        }, {
            timeout: 10000
        })

        const customers = response2.data

        let combinedResponse = filteredOrders.map(order => {
            const customer = customers.find(cust => cust.customercode === order.CUNO)
            return {
                OAORDT: formatDate(order.OAORDT),
                CUNO: order.CUNO,
                customername: customer ? customer.customername : '',
                CUOR: order.CUOR,
                total: order.total,
                area: customer ? customer.area.trim() : ''
            }
        })

        const result = area ? combinedResponse.filter(order => order.area === area.trim()) : combinedResponse

        combinedResponse = result.sort((a, b) => {
            return b.CUOR.localeCompare(a.CUOR)
        })

        res.json(combinedResponse)
    } catch (error) {
        console.error('Error processing orders:', error.message)
        res.status(500).json({ message: 'Internal Server Error' })
    }
})

app.post('/receipt/orderDetail', async (req, res) => {
    let { order } = req.body

    try {
        const newData = await fetchData()
        const combinedData = await combineData(newData)

        await saveDataToFile(combinedData)

        const validWHLO = ["215", "216", "217", "218"]
        const filteredOrders = combinedData.filter(order => validWHLO.includes(order.WHLO.trim()))

        const response2 = await axios.post('http://192.168.2.97:8383/M3API/OrderManage/order/getCustomer', {
            customertype: '103'
        }, {
            timeout: 10000
        })

        const customers = response2.data

        let combinedResponse = filteredOrders.map(order => {
            const customer = customers.find(cust => cust.customercode === order.CUNO)
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
                total: order.total,
                ex_vat: order.ex_vat,
                vat: order.vat,
                customer: trimCustomerData(customer),
                items: order.items,
                area: customer ? customer.area.trim() : null
            }
        })

        const result = order ? combinedResponse.filter(item => item.CUOR === order) : combinedResponse

        combinedResponse = result.sort((a, b) => {
            return b.CUOR.localeCompare(a.CUOR)
        })

        res.json(combinedResponse)
    } catch (error) {
        console.error('Error processing orders:', error.message)
        res.status(500).json({ message: 'Internal Server Error' })
    }
})

module.exports = app
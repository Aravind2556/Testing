const Express = require('express')
const LocationJSON = require('../datasets/IndiaPostal.json')
const CitiesJSON = require('../datasets/Citites.json')

const LocationRouter = Express.Router()

LocationRouter.post('/fetch-locations', async(req, res)=>{
    try{


        const data = LocationJSON.records.map(item=>(`${item.district} - ${item.statename}`))


        return res.status(200).json({success: true, message: "Successfully fetched Locations!", data})
    }
    catch(err){
        console.log("Error in fetching Locations:",err)
        return res.status(404).json({success: false, message: "Trouble in fetching Locations! please contact Support Team."})
    }
})

LocationRouter.post('/fetch-cities', async(req, res)=>{
    try{
        const {keyword} = req.body

        if(!keyword)
            return res.status(400).json({success: false, message: "Please provide any keywords!"})

        if(keyword.length < 3)
            return res.status(400).json({success: false, message: "Please provide keywords with atleast 3 characters long!"})
    
        if(!CitiesJSON)
            return res.status(404).json({success: false, message: "City data not found! please contact support team."})

        const fetchedCities = CitiesJSON.filter(city => city.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()))

        if(!fetchedCities)
            return res.status(404).json({success: false, message: "Failed to fetch Cities! please contact support team."})

        return res.status(200).json({success: true, message: "Successfully fetched citites!", cities: fetchedCities})

    }
    catch(err){
        console.log("Error in fetching citites:",err)
        return res.status(404).json({success: false, message: "Trouble in fetching Cities! please contact Support Team."})
    }
})

module.exports = LocationRouter
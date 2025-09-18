
const excludeBadges = async (groupName, groupData, fields) => {

    if (!groupData || !groupName || typeof groupData !== 'object') {
        return { success: false, message: `No Data available for ${groupName}` }
    }
    
    const { exclude, excludeBadges } = groupData;

    if (exclude && Array.isArray(excludeBadges) && excludeBadges.length > 0) {
        const excludingFilter = {
            $or: fields.flatMap(field =>
                excludeBadges.map(badge => ({
                    [field]: { $regex: badge, $options: 'i' }
                }))
            )
        }

        if(!excludingFilter){
            return { success: false, message: `Failed in generating search filter for ${groupName}` }
        }

        return {success: true, message: `Successfully generated exclude filter for ${groupName}`, excludingFilter}
    }
    else{
        return { success: false, message: `Invalid data format for ${groupName}` }
    }
}

module.exports = excludeBadges
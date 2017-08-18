module.exports.pagiPackages = function(req, packages) {
	// 分页参数
	var page = req.query.page || req.body.page;
	var pageSize = req.query.pageSize || req.body.pageSize;
	var totalItem = packages.length;
	var pagi_packages;
	var totalPage = 1;
	//有参数时将packges分段
	if (page && pageSize) {
		page = parseInt(page, 10);
		pageSize = parseInt(pageSize, 10);
		// 计算总页数
		totalPage = Math.ceil(totalItem / pageSize);
		//若请求页超过最大页，默认赋值最大页
		if (page > totalPage) {
			page = totalPage;
		}
		//若请求页<=0，默认赋值第一页
		if (page <= 0) {
			page = 0;
		}
		var start = pageSize * page;
		var end = pageSize * parseInt(page + 1, 10);
		pagiPackages = packages.slice(start, end);

	}
	//无参数时默认传输所有
	else {
		pagiPackages = packages;
	}
	var result = {
		pagiPackages: pagiPackages,
		totalPage: totalPage,
		page: page,
		pageSize: pageSize

	};
	return result;
};

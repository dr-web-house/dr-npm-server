var async = require('async');
var _ = require('lodash');
var pagination = require('./pagination');
var Search = require('../build/lib/search');

exports.createRouter = function(config, auth, storage, app) {
	/**
	 * 列表接口
	 */
	app.get('/-wfh/packages', function(req, res, next) {
		var base = config.url_prefix ?
			config.url_prefix.replace(/\/$/, '') :
			req.protocol + '://' + req.get('host');
		storage.get_local(function(err, packages) {
			if (err) throw err;
			async.filterSeries(packages, function(package, cb) {
				auth.allow_access(package.name, req.remote_user, function(err, allowed) {
					setImmediate(function() {
						if (err) {
							cb(null, false);
						} else {
							cb(err, allowed);
						}
					});
				});
			}, function(err, packages) {
				if (err) throw err;
				//排除category为internal的包
				var selectPackages = _.filter(packages, function(package) {
					var get = _.get(package, 'dr.category');
					if (!_.includes([].concat(get), 'internal')) {
						return true;
					}
				});
				selectPackages.sort(function(p1, p2) {
					//按日期倒序排列	
					if (p2.date < p1.date) {
						return -1;
					} else {
						return 1;
					}
				});
				//分页处理				
				var pagiResult = pagination.pagiPackages(req, selectPackages);
				next({
					name: config.web && config.web.title ? config.web.title : 'Verdaccio',
					packages: pagiResult.pagiPackages,
					baseUrl: base,
					username: req.remote_user.name,
					totalPage: pagiResult.totalPage,
					page: pagiResult.page,
					pageSize: pagiResult.pageSize
				});
			});
		});
	});

	/**
	 * 搜索接口
	 * @param {any} anything 搜索内容
	 */
	app.get('/-wfh/search/:anything', function(req, res, next) {
		var anything = req.params.anything;		
		//FE-1365 NPM优化：增加标签查询
		var categoryReg = new RegExp(/\$\w*/, "g");
		var categoryTag = [];
		anything.match(categoryReg) && anything.match(categoryReg).forEach((val) => {
			val = val.replace(/\$/g, '');
			categoryTag.push(val);
		});
		if (categoryTag.length > 0) {
			storage.get_local((err, packages) => {
				if (err) throw err;
				async.filterSeries(packages, (package, cb) => {
					auth.allow_access(package.name, req.remote_user, (err, allowed) => {
						setImmediate(function() {
							if (err) {
								cb(null, false);
							} else {
								cb(err, allowed);
							}
						});
					});
				}, (err, packages) => {
					if (err) throw err;
					var searchPackages = [];
					//根据$标签筛选
					searchPackages = _.filter(packages, (package) => {
						var get = _.get(package, 'dr.category');
						var both = _.intersection(categoryTag, get);
						if (both.length > 0 && _.isEqual(both.sort(), categoryTag.sort())) {
							return true;
						}
					});
					searchOutput(searchPackages, req, res, next);
				});
			});
		} else {
			var results = Search.query(anything);
			var pArr = [];
			_.forEach(results, (result) => {
				var tmp = new Promise((resolve, reject) => {
					storage.get_package(result.ref, (err, entry) => {
						if (!err && entry) {
							auth.allow_access(entry.name, req.remote_user, (err, allowed) => {
								if (err || !allowed) {
									return;
								}
								resolve(entry.versions[entry['dist-tags'].latest])
							});
						}
					});
				})
				pArr.push(tmp);
			});
			Promise.all(pArr).then(values => {
				searchOutput(values, req, res, next);
			})
		}
	});

	function searchOutput(searchPackages, req, res, next) {
		searchPackages.sort(function(p1, p2) {
			//按日期倒序排列	
			if (p2.date < p1.date) {
				return -1;
			} else {
				return 1;
			}
		});
		//分页处理
		var pagiResult = pagination.pagiPackages(req, searchPackages);
		next({
			packages: pagiResult.pagiPackages,
			totalPage: pagiResult.totalPage,
			page: pagiResult.page,
			pageSize: pagiResult.pageSize
		});
	}

	/**
	 * 自定义条件查询接口
	 * @param {any} by 查询条件的字段
	 * @param {any} value 查询条件的值
	 */
	app.get('/-wfh/select/:by/:value', function(req, res, next) {
		var by = req.params.by;
		var byValue = req.params.value;
		if (!by || !byValue) {
			res.send({
				'error': 'param must be complete,/-wfh/select/:by/:value'
			});
		}
		var base = config.url_prefix ?
			config.url_prefix.replace(/\/$/, '') :
			req.protocol + '://' + req.get('host');
		storage.get_local(function(err, packages) {
			if (err) throw err;
			async.filterSeries(packages, function(package, cb) {
				auth.allow_access(package.name, req.remote_user, function(err, allowed) {
					setImmediate(function() {
						if (err) {
							cb(null, false);
						} else {
							cb(err, allowed);
						}
					});
				});
			}, function(err, packages) {
				if (err) throw err;
				//根据条件筛选结果
				var selectPackages = _.filter(packages, function(package) {
					var get = _.get(package, by);
					if (_.includes([].concat(get), byValue)) {
						return true;
					}
				});
				selectPackages.sort(function(p1, p2) {
					//按日期倒序排列	
					if (p2.date < p1.date) {
						return -1;
					} else {
						return 1;
					}
				});
				//分页处理				
				var pagiResult = pagination.pagiPackages(req, selectPackages);
				next({
					name: config.web && config.web.title ? config.web.title : 'Verdaccio',
					packages: pagiResult.pagiPackages,
					baseUrl: base,
					username: req.remote_user.name,
					totalPage: pagiResult.totalPage,
					page: pagiResult.page,
					pageSize: pagiResult.pageSize
				});
			});
		});
	});

	/**
	 * 查询版本号接口
	 * @param {any} packageName package的名称
	 */
	app.get('/-wfh/versions', function(req, res, next) {
		var packageName = req.query.packageName || req.body.packageName;
		packageName = decodeURIComponent(packageName)
		var results = Search.query(packageName);
		var packageWithVersions = [];
		results = _.remove(results, function(data) {
			return data.ref === packageName;
		});
		storage.get_package(results[0].ref, function(err, entry, version) {
			if (!err && entry) {
				packageWithVersions = {
					name: entry.name,
					versions: Object.keys(entry.versions),
					latest: entry['dist-tags'].latest
				};
			}
			next(packageWithVersions);
		});
	});
};

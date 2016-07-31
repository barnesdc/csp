var csp = require('..')

var _ = require('lodash')
var parseCsp = require('content-security-policy-parser')
var express = require('express')
var request = require('supertest')
var assert = require('assert')
var AGENTS = require('./browser-data')

var POLICY = {
  defaultSrc: ["'self'"],
  'script-src': ['scripts.biz'],
  styleSrc: ['styles.biz', function (req, res) {
    return res.locals.nonce
  }],
  objectSrc: ["'none'"],
  imgSrc: ['data:']
}

var EXPECTED_POLICY = {
  'default-src': ["'self'"],
  'script-src': ['scripts.biz'],
  'style-src': ['styles.biz', 'abc123'],
  'object-src': ["'none'"],
  'img-src': ['data:']
}

describe('csp middleware', function () {
  function use (options) {
    var result = express()
    result.use(function (req, res, next) {
      res.locals.nonce = 'abc123'
      next()
    })
    result.use(csp(options))
    result.use(function (req, res) {
      res.end('Hello world!')
    })
    return result
  }

  it('sets all the headers if you tell it to', function (done) {
    var app = use({
      setAllHeaders: true,
      directives: {
        defaultSrc: ["'self'", 'domain.com']
      }
    })

    request(app).get('/').set('User-Agent', AGENTS['Firefox 23'].string)
      .expect('X-Content-Security-Policy', "default-src 'self' domain.com")
      .expect('Content-Security-Policy', "default-src 'self' domain.com")
      .expect('X-WebKit-CSP', "default-src 'self' domain.com")
      .end(done)
  })

  it('sets all the headers if you provide an unknown user-agent', function (done) {
    var app = use({
      directives: {
        defaultSrc: ["'self'", 'domain.com']
      }
    })

    request(app).get('/').set('User-Agent', 'Burrito Browser')
      .expect('X-Content-Security-Policy', "default-src 'self' domain.com")
      .expect('Content-Security-Policy', "default-src 'self' domain.com")
      .expect('X-WebKit-CSP', "default-src 'self' domain.com")
      .end(done)
  })

  it('sets all the headers if there is no user-agent', function (done) {
    var app = use({
      directives: {
        defaultSrc: ["'self'", 'domain.com']
      }
    })

    request(app).get('/').unset('User-Agent')
      .expect('X-Content-Security-Policy', "default-src 'self' domain.com")
      .expect('Content-Security-Policy', "default-src 'self' domain.com")
      .expect('X-WebKit-CSP', "default-src 'self' domain.com")
      .end(done)
  })

  it('can set the report-only headers', function (done) {
    var app = use({
      reportOnly: true,
      setAllHeaders: true,
      directives: {
        'default-src': ["'self'"]
      }
    })

    request(app).get('/').set('User-Agent', AGENTS['Firefox 23'].string)
      .end(function (err, res) {
        if (err) { return done(err) }

        assert.equal(res.headers['content-security-policy'], undefined)
        assert.equal(res.headers['x-content-security-policy'], undefined)
        assert.equal(res.headers['x-webkit-csp'], undefined)

        assert.equal(res.headers['content-security-policy-report-only'], "default-src 'self'")
        assert.equal(res.headers['x-content-security-policy-report-only'], "default-src 'self'")
        assert.equal(res.headers['x-webkit-csp-report-only'], "default-src 'self'")

        done()
      })
  })

  it('can use a function to set the report-only headers to true', function (done) {
    var app = use({
      reportOnly: function (req, res) {
        return true
      },
      setAllHeaders: true,
      directives: {
        'default-src': ["'self'"],
        'report-uri': '/reporter'
      }
    })

    request(app).get('/').set('User-Agent', AGENTS['Firefox 23'].string)
      .end(function (err, res) {
        if (err) { return done(err) }

        var expected = {
          'default-src': ["'self'"],
          'report-uri': ['/reporter']
        }

        assert.equal(res.headers['content-security-policy'], undefined)
        assert.equal(res.headers['x-content-security-policy'], undefined)
        assert.equal(res.headers['x-webkit-csp'], undefined)

        assert.deepEqual(parseCsp(res.headers['content-security-policy-report-only']), expected)
        assert.deepEqual(parseCsp(res.headers['x-content-security-policy-report-only']), expected)
        assert.deepEqual(parseCsp(res.headers['x-webkit-csp-report-only']), expected)

        done()
      })
  })

  it('can use a function to set the report-only headers to false', function (done) {
    var app = use({
      reportOnly: function (req, res) {
        return false
      },
      setAllHeaders: true,
      directives: {
        'default-src': ["'self'"],
        'report-uri': '/reporter'
      }
    })

    request(app).get('/').set('User-Agent', AGENTS['Firefox 23'].string)
      .end(function (err, res) {
        if (err) { return done(err) }

        var expected = {
          'default-src': ["'self'"],
          'report-uri': ['/reporter']
        }

        assert.equal(res.headers['content-security-policy-report-only'], undefined)
        assert.equal(res.headers['x-content-security-policy-report-only'], undefined)
        assert.equal(res.headers['x-webkit-csp-report-only'], undefined)

        assert.deepEqual(parseCsp(res.headers['content-security-policy']), expected)
        assert.deepEqual(parseCsp(res.headers['x-content-security-policy']), expected)
        assert.deepEqual(parseCsp(res.headers['x-webkit-csp']), expected)

        done()
      })
  })

  it('throws an error when reportOnly is true and there is no report-uri', function () {
    assert.throws(function () {
      csp({ reportOnly: true })
    }, Error)
  })

  it("doesn't splice the original array", function (done) {
    var app = use({
      directives: {
        'style-src': [
          "'self'",
          "'unsafe-inline'"
        ]
      }
    })
    var chrome = AGENTS['Chrome 27']
    var ff = AGENTS['Firefox 22']

    request(app).get('/').set('User-Agent', chrome.string)
      .expect(chrome.header, /style-src 'self' 'unsafe-inline'/)
      .end(function () {
        request(app).get('/').set('User-Agent', ff.string)
          .expect(ff.header, /style-src 'self'/)
          .end(function () {
            request(app).get('/').set('User-Agent', chrome.string)
              .expect(chrome.header, /style-src 'self' 'unsafe-inline'/)
              .end(done)
          })
      })
  })

  it('names its function and middleware', function () {
    assert.equal(csp.name, 'csp')
    assert.equal(csp({ directives: POLICY }).name, 'csp')
  })

  describe('normal browsers', function () {
    _.each(AGENTS, function (agent, name) {
      if (agent.special) { return }

      it('sets the header properly for ' + name, function (done) {
        var app = use({ directives: POLICY })

        request(app).get('/').set('User-Agent', agent.string)
        .end(function (err, res) {
          if (err) { return done(err) }

          var header = agent.header.toLowerCase()
          assert.deepEqual(parseCsp(res.headers[header]), EXPECTED_POLICY)

          done()
        })
      })

      it('does not set other headers for ' + name, function (done) {
        var app = use({ directives: POLICY })

        request(app).get('/').set('User-Agent', agent.string)
        .end(function (err, res) {
          if (err) { return done(err) }

          [
            'content-security-policy',
            'x-content-security-policy',
            'x-webkit-csp'
          ].forEach(function (header) {
            if (header === agent.header.toLowerCase()) { return }
            assert.equal(res.headers[header], undefined)
          })

          done()
        })
      })
    })
  })

  describe('special browsers', function () {
    it('sets the header properly for Firefox 22', function (done) {
      var app = use({
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ['connect.com']
        }
      })

      request(app).get('/').set('User-Agent', AGENTS['Firefox 22'].string)
      .end(function (err, res) {
        if (err) { return done(err) }

        assert.deepEqual(parseCsp(res.headers['x-content-security-policy']), {
          'default-src': ["'self'"],
          'xhr-src': ['connect.com']
        })

        done()
      })
    })

    ;[
      'Safari 4.1',
      'Safari 5.1 on OS X',
      'Safari 5.1 on Windows Server 2008'
    ].forEach(function (browser) {
      it("doesn't set the property for " + browser, function (done) {
        var app = use({ directives: POLICY })

        request(app).get('/').set('User-Agent', AGENTS[browser].string)
        .end(function (err, res) {
          if (err) { return done(err) }

          assert.equal(res.header['x-webkit-csp'], undefined)
          assert.equal(res.header['content-security-policy'], undefined)
          assert.equal(res.header['x-content-security-policy'], undefined)

          done()
        })
      })
    })

    it('lets you disable Android', function (done) {
      var app = use({
        disableAndroid: true,
        directives: {
          defaultSrc: ['a.com']
        }
      })

      request(app).get('/').set('User-Agent', AGENTS['Android 4.4.3'].string)
      .end(function (err, res) {
        if (err) { return done(err) }

        assert.equal(res.header['x-webkit-csp'], undefined)
        assert.equal(res.header['content-security-policy'], undefined)
        assert.equal(res.header['x-content-security-policy'], undefined)

        done()
      })
    })

    it("appends connect-src 'self' in iOS Chrome when connect-src is already defined", function (done) {
      var app = use({
        directives: {
          connectSrc: ['connect.com']
        }
      })
      var iosChrome = AGENTS['iOS Chrome 40']

      request(app).get('/').set('User-Agent', iosChrome.string)
      .end(function (err, res) {
        if (err) { return done(err) }

        var header = iosChrome.header.toLowerCase()
        var connectSrc = parseCsp(res.headers[header])['connect-src'].sort()
        assert.deepEqual(connectSrc, ["'self'", 'connect.com'])

        done()
      })
    })

    it("adds connect-src 'self' in iOS Chrome when connect-src is undefined", function (done) {
      var app = use({
        directives: {
          styleSrc: ["'self'"]
        }
      })
      var iosChrome = AGENTS['iOS Chrome 40']

      request(app).get('/').set('User-Agent', iosChrome.string)
      .expect(iosChrome.header, /connect-src 'self'/)
      .end(done)
    })

    it("does nothing in iOS Chrome if connect-src 'self' is defined", function (done) {
      var app = use({
        directives: {
          connectSrc: ['somedomain.com', "'self'"]
        }
      })
      var iosChrome = AGENTS['iOS Chrome 40']
      request(app).get('/').set('User-Agent', iosChrome.string)
      .expect(iosChrome.header, "connect-src somedomain.com 'self'")
      .end(done)
    })
  })

  describe('without browser sniffing', function () {
    it('lets you disable all user-agent parsing for normal headers', function (finalDone) {
      var done = _.after(Object.keys(AGENTS).length, finalDone)

      _.each(AGENTS, function (agent, name) {
        var app = use({
          directives: POLICY,
          browserSniff: false
        })

        request(app).get('/').set('User-Agent', agent.string)
        .end(function (err, res) {
          if (err) { return done(err) }

          assert.deepEqual(parseCsp(res.headers['content-security-policy']), EXPECTED_POLICY)
          assert.equal(res.headers['x-content-security-policy'], undefined)
          assert.equal(res.header['x-webkit-csp'], undefined)

          done()
        })
      })
    })

    it('lets you disable all user-agent parsing for report-only headers', function (finalDone) {
      var done = _.after(Object.keys(AGENTS).length, finalDone)
      var policy = _.extend({ reportUri: '/' }, POLICY)
      var expectedPolicy = _.extend({ 'report-uri': ['/'] }, EXPECTED_POLICY)

      _.each(AGENTS, function (agent, name) {
        var app = use({
          directives: policy,
          reportOnly: true,
          browserSniff: false
        })

        request(app).get('/').set('User-Agent', agent.string)
        .end(function (err, res) {
          if (err) { return done(err) }

          assert.deepEqual(parseCsp(res.headers['content-security-policy-report-only']), expectedPolicy)
          assert.equal(res.headers['x-content-security-policy-report-only'], undefined)
          assert.equal(res.header['x-webkit-csp-report-only'], undefined)

          done()
        })
      })
    })

    it('lets you set all headers', function (finalDone) {
      var done = _.after(Object.keys(AGENTS).length, finalDone)

      _.each(AGENTS, function (agent, name) {
        var app = use({
          directives: POLICY,
          browserSniff: false,
          setAllHeaders: true
        })

        request(app).get('/').set('User-Agent', agent.string)
        .end(function (err, res) {
          if (err) { return done(err) }

          assert.deepEqual(parseCsp(res.headers['content-security-policy']), EXPECTED_POLICY)
          assert.deepEqual(parseCsp(res.headers['x-content-security-policy']), EXPECTED_POLICY)
          assert.deepEqual(parseCsp(res.headers['x-webkit-csp']), EXPECTED_POLICY)

          done()
        })
      })
    })
  })
})

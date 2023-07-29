const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");

const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());
module.exports = app;

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3010, () => {
      console.log("Server running at http://localhost:3010");
    });
  } catch (e) {
    console.log(`Db Error:${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeaders = request.headers["authorization"];
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "mahivarma", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        const { username } = payload;
        request.username = username;
        next();
      }
    });
  }
};

const isFollowing = async (request, response, next) => {
  const { username } = request;
  const getUserIdQuery = `
    SELECT user_id 
    FROM user 
    WHERE username = '${username}'`;
  const userId = await db.get(getUserIdQuery);

  const getFollowingUserNameQuery = `
    SELECT user_id
    FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE following_user_id = '${userId.user_id}';
    `;
  const followingUserId = await db.all(getFollowingUserNameQuery);
  request.userIdObjectArray = followingUserId;
  next();
};

//API 1 register
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;

  const dbUser = await db.get(selectUserQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const registerUserQuery = `
            INSERT INTO user (username, password, name, gender)
            VALUES(
                '${username}',
                '${hashedPassword}',
                '${name}',
                '${gender}'
                )
            `;

      await db.run(registerUserQuery);
      response.send("User created successfully");
    }
  }
});

//API 2 login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT * FROM user WHERE username ='${username}';
    `;

  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordRight = await bcrypt.compare(password, dbUser.password);
    if (isPasswordRight === true) {
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "mahivarma");
      console.log(jwtToken);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;

  const userIdQuery = `
    SELECT user_id 
    FROM user 
    WHERE username = '${username}';
    `;
  const userId = await db.get(userIdQuery);

  const getTweetQuery = `
    SELECT 
        user.username,
        tweet.tweet,
        tweet.date_time
    FROM 
        user INNER JOIN tweet ON 
        user.user_id = tweet.user_id
    WHERE user.user_id IN (
        SELECT following_user_id
        FROM follower 
        WHERE follower_user_id = '${userId.user_id}'
    )
    ORDER BY date_time DESC 
    LIMIT 4;
    `;

  const tweets = await db.all(getTweetQuery);

  response.send(
    tweets.map((eachTweet) => {
      return {
        username: eachTweet.username,
        tweet: eachTweet.tweet,
        dateTime: eachTweet.date_time,
      };
    })
  );
});

//API 4
app.get("/user/following", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
    SELECT user_id 
    FROM user 
    WHERE username = '${username}'`;
  const userId = await db.get(getUserIdQuery);

  const getFollowingUserNameQuery = `
    SELECT name
    FROM user
    WHERE user_id IN (
        SELECT following_user_id 
        FROM follower 
        WHERE follower_user_id = '${userId.user_id}'
    );
    `;
  const followingUserName = await db.all(getFollowingUserNameQuery);
  response.send(
    followingUserName.map((eachName) => {
      return {
        name: eachName.name,
      };
    })
  );
});

//API 5
app.get("/user/followers", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
    SELECT user_id 
    FROM user 
    WHERE username = '${username}'`;
  const userId = await db.get(getUserIdQuery);

  const getFollowerUserNameQuery = `
    SELECT name
    FROM user
    WHERE user_id IN (
        SELECT follower_user_id 
        FROM follower 
        WHERE following_user_id = '${userId.user_id}'
    );
    `;
  const followerUserName = await db.all(getFollowerUserNameQuery);
  response.send(
    followerUserName.map((eachName) => {
      return {
        name: eachName.name,
      };
    })
  );
});

//API 6
app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  isFollowing,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userIdObjectArray } = request;
    const userIdArray = userIdObjectArray.map((eachUserId) => {
      return eachUserId.user_id;
    });
    const getUserIdQuery = `
    SELECT user_id FROM tweet WHERE tweet_id = '${tweetId}';
    `;
    const userIdToVerify = await db.get(getUserIdQuery);

    if (userIdArray.includes(userIdToVerify.user_id) === true) {
      const getUserTweetQuery = `
        SELECT 
            tweet,
            date_time
        FROM tweet 
        WHERE tweet_id ='${tweetId}';
        `;
      const userTweet = await db.get(getUserTweetQuery);

      const getLikesCountQuery = `
      SELECT COUNT() AS likes
      FROM like 
      WHERE tweet_id = '${tweetId}'
      GROUP BY tweet_id;
      `;
      const likesCount = await db.get(getLikesCountQuery);

      const getRepliesCountQuery = `
      SELECT COUNT(reply_id) AS replies
      FROM reply 
      WHERE tweet_id = '${tweetId}'
      GROUP BY tweet_id;
      `;
      const repliesCount = await db.get(getRepliesCountQuery);
      response.send({
        tweet: userTweet.tweet,
        likes: likesCount.likes,
        replies: repliesCount.replies,
        dateTime: userTweet.date_time,
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  isFollowing,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userIdObjectArray } = request;
    const userIdArray = userIdObjectArray.map((eachUserId) => {
      return eachUserId.user_id;
    });
    const getUserIdQuery = `
    SELECT user_id FROM tweet WHERE tweet_id = '${tweetId}';
    `;
    const userIdToVerify = await db.get(getUserIdQuery);

    if (userIdArray.includes(userIdToVerify.user_id) === true) {
      const getUserNameQuery = `
        SELECT 
            username
        FROM user 
        WHERE user_id IN (
                SELECT user_id
                FROM like 
                WHERE tweet_id = '${tweetId}'
        );
        `;
      const userName = await db.all(getUserNameQuery);
      response.send({
        likes: userName.map((eachName) => {
          return eachName.username;
        }),
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  isFollowing,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userIdObjectArray } = request;
    const userIdArray = userIdObjectArray.map((eachUserId) => {
      return eachUserId.user_id;
    });
    const getUserIdQuery = `
    SELECT user_id FROM tweet WHERE tweet_id = '${tweetId}';
    `;
    const userIdToVerify = await db.get(getUserIdQuery);

    if (userIdArray.includes(userIdToVerify.user_id) === true) {
      const getReplyUserDetailsQuery = `
        SELECT 
            user.name,
            reply.reply
        FROM (user INNER JOIN reply ON user.user_id = reply.user_id)
        AS T INNER JOIN tweet ON T.tweet_id = tweet.tweet_id
        WHERE user.user_id IN (
            SELECT user_id 
            FROM reply
            WHERE tweet_id = '${tweetId}'
        ) AND tweet.tweet_id = '${tweetId}';
        `;
      const userReplies = await db.all(getReplyUserDetailsQuery);
      response.send({
        replies: userReplies.map((eachReply) => {
          return eachReply;
        }),
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
    SELECT user_id 
    FROM user 
    WHERE username = '${username}';
    `;

  const userId = await db.get(getUserIdQuery);

  const getTweetsQuery = `
    SELECT 
        tweet,
        (SELECT COUNT()
        FROM like 
        WHERE tweet_id IN (
            SELECT tweet_id 
            FROM tweet 
            WHERE user_id = '${userId.user_id}'
            )
        GROUP BY tweet_id) AS likes,
        (SELECT COUNT() AS replies
        FROM reply
        WHERE tweet_id IN (
            SELECT tweet_id 
            FROM tweet 
            WHERE user_id = '${userId.user_id}'
            )
        GROUP BY tweet_id) AS replies,
        tweet.date_time AS dateTime
    FROM 
        tweet 
    WHERE user_id = '${userId.user_id}';
    `;
  const tweets = await db.all(getTweetsQuery);

  response.send(tweets);
});

//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const postQuery = `
    INSERT INTO tweet (tweet)
    VALUES('${tweet}');
    `;

  await db.run(postQuery);
  response.send("Created a Tweet");
});

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getTweetIdQuery = `
    SELECT tweet_id 
    FROM tweet
    WHERE user_id = (
        SELECT user_id 
        FROM user 
        WHERE username = '${username}'
    )
    `;
    const tweetIdObjectArray = await db.all(getTweetIdQuery);
    console.log(tweetIdObjectArray);

    const tweetIdArray = tweetIdObjectArray.map((eachTweetObject) => {
      return eachTweetObject.tweet_id;
    });
    const id = parseInt(tweetId);
    if (tweetIdArray.includes(id) === true) {
      const deleteQuery = `
        DELETE FROM tweet 
        WHERE tweet_id = '${tweetId}'
        `;

      await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
